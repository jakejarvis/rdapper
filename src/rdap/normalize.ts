import { finalizeContact } from "../lib/contacts";
import { toISO } from "../lib/dates";
import { isPrivacyName } from "../lib/privacy";
import { asDateLike, asString, asStringArray, uniq } from "../lib/text";
import type { Contact, DomainRecord, Nameserver, Redaction, RegistrarInfo } from "../types";

type RdapDoc = Record<string, unknown>;

/**
 * Convert RDAP JSON into our normalized DomainRecord.
 * This function is defensive: RDAP servers vary in completeness and field naming.
 */
export function normalizeRdap(
  inputDomain: string,
  tld: string,
  rdap: unknown,
  rdapServersTried: string[],
  includeRaw = false,
): DomainRecord {
  const doc = (rdap ?? {}) as RdapDoc;

  // Prefer ldhName (punycode) and unicodeName if provided
  const ldhName: string | undefined = asString(doc.ldhName) || asString(doc.handle);
  const unicodeName: string | undefined = asString(doc.unicodeName);

  // Registrar entity can be provided with role "registrar"
  const registrar: RegistrarInfo | undefined = extractRegistrar(doc.entities as unknown);

  // Nameservers: normalize host + IPs
  const nameservers: Nameserver[] | undefined = Array.isArray(doc.nameservers)
    ? (doc.nameservers as RdapDoc[])
        .map((ns) => {
          const host = (asString(ns.ldhName) ?? asString(ns.unicodeName) ?? "").toLowerCase();
          const ip = ns.ipAddresses as RdapDoc | undefined;
          const ipv4 = asStringArray(ip?.v4);
          const ipv6 = asStringArray(ip?.v6);
          const n: Nameserver = { host };
          if (ipv4?.length) n.ipv4 = ipv4;
          if (ipv6?.length) n.ipv6 = ipv6;
          return n;
        })
        .filter((n) => !!n.host)
    : undefined;

  // RFC 9537 redaction metadata
  const redactions = extractRedactions(doc.redacted);

  // Contacts: RDAP entities include roles like registrant, administrative, technical, billing, abuse
  const contacts: Contact[] | undefined = extractContacts(doc.entities as unknown, redactions);

  // Derive privacy flag from registrant name/org keywords or RFC 9537 registrant redactions
  const registrant = contacts?.find((c) => c.type === "registrant");
  const privacyEnabled =
    !!(
      registrant &&
      ([registrant.name, registrant.organization].filter(Boolean) as string[]).some(isPrivacyName)
    ) ||
    !!registrant?.redacted ||
    !!redactions?.some((r) => redactionTargetsRole(r, "registrant"));

  // RDAP uses IANA EPP status values. Preserve raw plus a description if any remarks are present.
  const statuses = Array.isArray(doc.status)
    ? (doc.status as unknown[])
        .filter((s): s is string => typeof s === "string")
        .map((s) => ({ status: s, raw: s }))
    : undefined;

  // Secure DNS info
  const secureDNS = doc.secureDNS as
    | { delegationSigned?: unknown; dsData?: Array<Record<string, unknown>> }
    | undefined;
  const dnssec = secureDNS
    ? {
        enabled: !!secureDNS.delegationSigned,
        dsRecords: Array.isArray(secureDNS.dsData)
          ? (secureDNS.dsData as Array<Record<string, unknown>>).map((d) => ({
              keyTag: d.keyTag as number | undefined,
              algorithm: d.algorithm as number | undefined,
              digestType: d.digestType as number | undefined,
              digest: d.digest as string | undefined,
            }))
          : undefined,
      }
    : undefined;

  // RDAP "events" contain timestamps for registration, last changed, expiration, deletion, etc.
  type RdapEvent = { eventAction?: string; eventDate?: string | number | Date };
  const events: RdapEvent[] = Array.isArray(doc.events)
    ? (doc.events as unknown[] as RdapEvent[])
    : [];
  const actionOf = (e: RdapEvent) => (typeof e?.eventAction === "string" ? e.eventAction : "");
  // Prefer an exact match, then a substring match that ignores "reregistration" (RFC 9083)
  const byAction = (action: string) =>
    events.find((e) => actionOf(e).toLowerCase() === action) ??
    events.find((e) => {
      const a = actionOf(e).toLowerCase();
      return a.includes(action) && a !== "reregistration";
    });
  const creationDate = toISO(
    asDateLike(byAction("registration")?.eventDate) ?? asDateLike(doc.registrationDate),
  );
  const updatedDate = toISO(
    asDateLike(byAction("last changed")?.eventDate) ?? asDateLike(doc.lastChangedDate),
  );
  const expirationDate = toISO(
    asDateLike(byAction("expiration")?.eventDate) ?? asDateLike(doc.expirationDate),
  );
  const deletionDate = toISO(
    asDateLike(byAction("deletion")?.eventDate) ?? asDateLike(doc.deletionDate),
  );

  // Registries that keep answering for released/available names signal it via status
  const isRegistered = !statuses?.some((s) =>
    /^(available|free|released|pending release|release process[:\s-]*waiting)$/i.test(
      s.status.trim(),
    ),
  );

  // Derive a simple transfer lock flag from statuses
  const transferLock = !!statuses?.some((s: { status: string }) =>
    /transfer[-\s]*prohibited/i.test(s.status),
  );

  // The RDAP document may include "port43" pointer to authoritative WHOIS
  const whoisServer: string | undefined = asString(doc.port43);

  const record: DomainRecord = {
    domain: unicodeName || ldhName || inputDomain,
    tld,
    isRegistered,
    isIDN: /(^|\.)xn--/i.test(ldhName || inputDomain),
    unicodeName: unicodeName || undefined,
    punycodeName: ldhName || undefined,
    registry: undefined, // RDAP rarely includes a clean registry operator name
    registrar: registrar,
    reseller: undefined,
    statuses: statuses,
    creationDate,
    updatedDate,
    expirationDate,
    deletionDate,
    transferLock,
    dnssec,
    nameservers: nameservers
      ? uniq(nameservers.map((n) => ({ ...n, host: n.host.toLowerCase() })))
      : undefined,
    contacts,
    privacyEnabled: privacyEnabled ? true : undefined,
    redactions,
    whoisServer,
    rdapServers: rdapServersTried,
    rawRdap: includeRaw ? rdap : undefined,
    rawWhois: undefined,
    source: "rdap",
    warnings: undefined,
  };

  return record;
}

/** Parse the RFC 9537 top-level "redacted" array. */
function extractRedactions(redacted: unknown): Redaction[] | undefined {
  if (!Array.isArray(redacted)) return undefined;
  const out: Redaction[] = [];
  for (const item of redacted) {
    if (!item || typeof item !== "object") continue;
    const r = item as RdapDoc;
    const nameObj = (r.name ?? {}) as RdapDoc;
    const name = asString(nameObj.description) || asString(nameObj.type);
    if (!name) continue;
    const reason = (r.reason ?? {}) as RdapDoc;
    out.push({
      name,
      prePath: asString(r.prePath) || undefined,
      postPath: asString(r.postPath) || undefined,
      replacementPath: asString(r.replacementPath) || undefined,
      method: asString(r.method) || undefined,
      reason: asString(reason.description) || asString(reason.type) || undefined,
    });
  }
  return out.length ? out : undefined;
}

function extractRegistrar(entities: unknown): RegistrarInfo | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const ent of entities) {
    const roles: string[] = Array.isArray((ent as RdapDoc)?.roles)
      ? ((ent as RdapDoc).roles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    if (!roles.some((r) => /registrar/i.test(r))) continue;
    const v = parseVcard((ent as RdapDoc)?.vcardArray);
    const ianaId = Array.isArray((ent as RdapDoc)?.publicIds)
      ? ((ent as RdapDoc).publicIds as Array<RdapDoc>).find((id) =>
          /iana\s*registrar\s*id/i.test(String(id?.type)),
        )?.identifier
      : undefined;
    return {
      name: v.fn || v.org || asString((ent as RdapDoc)?.handle) || undefined,
      ianaId: asString(ianaId),
      url: v.url ?? undefined,
      email: v.email?.[0],
      phone: v.tel?.[0],
      street: v.street,
      city: v.locality,
      state: v.region,
      postalCode: v.postcode,
      country: v.country,
      countryCode: v.countryCode,
    };
  }
  return undefined;
}

/** Does an RFC 9537 redaction refer to the entity with this RDAP role (e.g. "registrant")? */
function redactionTargetsRole(r: Redaction, role: string): boolean {
  const re = new RegExp(`\\b${role}\\b`, "i");
  return re.test(r.prePath ?? "") || re.test(r.name);
}

function extractContacts(entities: unknown, redactions?: Redaction[]): Contact[] | undefined {
  if (!Array.isArray(entities)) return undefined;
  const out: Contact[] = [];
  for (const ent of entities) {
    const roles: string[] = Array.isArray((ent as RdapDoc)?.roles)
      ? ((ent as RdapDoc).roles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    const v = parseVcard((ent as RdapDoc)?.vcardArray);
    const type = roles.find((r) =>
      /registrant|administrative|technical|billing|abuse|reseller/i.test(r),
    );
    if (!type) continue;
    const map: Record<string, Contact["type"]> = {
      registrant: "registrant",
      administrative: "admin",
      technical: "tech",
      billing: "billing",
      abuse: "abuse",
      reseller: "reseller",
    } as const;
    const roleKey = (map[type.toLowerCase()] ?? "unknown") as Contact["type"];
    const contact: Contact = {
      type: roleKey,
      name: v.fn,
      organization: v.org,
      email: single(v.email),
      phone: single(v.tel),
      fax: single(v.fax),
      street: v.street,
      city: v.locality,
      state: v.region,
      postalCode: v.postcode,
      country: v.country,
      countryCode: v.countryCode,
    };
    const hinted = !!redactions?.some((r) => redactionTargetsRole(r, type.toLowerCase()));
    out.push(finalizeContact(contact, hinted));
  }
  return out.length ? out : undefined;
}

/** Collapse a list to undefined, a single string, or the array when there are several. */
function single(list: string[] | undefined): string | string[] | undefined {
  if (!list?.length) return undefined;
  return list.length === 1 ? list[0] : list;
}

interface ParsedVCard {
  fn?: string;
  org?: string;
  email?: string[];
  tel?: string[];
  fax?: string[];
  url?: string;
  street?: string[];
  locality?: string;
  region?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
}

// Parse a minimal subset of vCard 4.0 arrays as used in RDAP "vcardArray" fields
function parseVcard(vcardArray: unknown): ParsedVCard {
  // vcardArray is typically ["vcard", [["version",{} ,"text","4.0"], ["fn",{} ,"text","Example"], ...]]
  if (!Array.isArray(vcardArray) || vcardArray[0] !== "vcard" || !Array.isArray(vcardArray[1]))
    return {};
  const entries = vcardArray[1] as Array<[string, Record<string, unknown>, string, unknown]>;
  const out: ParsedVCard = {};
  for (const e of entries) {
    const key = e?.[0];
    const value = e?.[3];
    if (!key) continue;
    switch (String(key).toLowerCase()) {
      case "fn":
        out.fn = asString(value);
        break;
      case "org":
        out.org = Array.isArray(value) ? value.map((x) => String(x)).join(" ") : asString(value);
        break;
      case "email": {
        const v = asString(value);
        if (v) (out.email ??= []).push(v);
        break;
      }
      case "tel": {
        const v = asString(value);
        if (!v) break;
        // RFC 6350 TYPE parameter may be a string or array (e.g. "fax", ["work", "fax"])
        const type = e?.[1]?.type;
        const types = (Array.isArray(type) ? type : [type]).map((t) => String(t).toLowerCase());
        (types.includes("fax") ? (out.fax ??= []) : (out.tel ??= [])).push(v);
        break;
      }
      case "url":
        out.url = asString(value);
        break;
      case "adr": {
        // adr value is [postOfficeBox, extendedAddress, street, locality, region, postalCode, country]
        if (Array.isArray(value)) {
          out.street = value[2] ? String(value[2]).split(/\r?\n/).filter(Boolean) : undefined;
          out.locality = asString(value[3]);
          out.region = asString(value[4]);
          out.postcode = asString(value[5]);
          out.country = asString(value[6]);
          // RFC 8605: ISO 3166-1 alpha-2 code lives in the "cc" parameter
          const cc = asString(e?.[1]?.cc);
          if (cc) out.countryCode = cc.toUpperCase();
        }
        break;
      }
    }
  }
  return out;
}
