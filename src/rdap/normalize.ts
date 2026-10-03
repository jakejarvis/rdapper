import { resolveCountry } from "../lib/countries";
import { finalizeContact, isPrivacyContact, mergeContacts, redactionFields } from "../lib/contacts";
import { toISO } from "../lib/dates";
import { mergeNameservers } from "../lib/nameservers";
import { normalizeEppStatus } from "../lib/status";
import { asDateLike, asString, asStringArray, uniqBy } from "../lib/text";
import { type ParsedVCard, parseVcard } from "./vcard";
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

  // Prefer ldhName (punycode, which Verisign writes in uppercase) and unicodeName if provided.
  // The handle ("2336799_DOMAIN_COM-VRSN") is a registry ID, not a name.
  const ldhName: string | undefined =
    asString(doc.ldhName)?.toLowerCase().replace(/\.$/, "") || undefined;
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

  // The reseller is an entity with the "reseller" role (e.g. .nl), so it is also a contact
  const resellerContact = contacts?.find((c) => c.type === "reseller");
  const reseller = resellerContact?.organization || resellerContact?.name || undefined;

  // Derive privacy flag from registrant name/org keywords or RFC 9537 registrant redactions
  const registrant = contacts?.find((c) => c.type === "registrant");
  const privacyEnabled =
    isPrivacyContact(registrant) ||
    !!redactions?.some((r) => redactionTargetsRole(r, "registrant"));

  // RDAP spells EPP statuses as words ("client transfer prohibited"): report the EPP code, as
  // WHOIS does, and keep the original in raw. Merged registry and registrar documents may list
  // the same status in different spellings.
  const statuses = Array.isArray(doc.status)
    ? uniqBy(
        (doc.status as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => ({ status: normalizeEppStatus(s), raw: s })),
        (s) => s.status.toLowerCase(),
      )
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
    reseller,
    statuses: statuses,
    creationDate,
    updatedDate,
    expirationDate,
    deletionDate,
    transferLock,
    dnssec,
    nameservers: mergeNameservers(nameservers),
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

/** An RDAP entity's string roles. */
function rolesOf(ent: unknown): string[] {
  const roles = (ent as RdapDoc)?.roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
}

/** vCard of the abuse contact nested in a registrar entity, where gTLD registries put it. */
function nestedAbuseVcard(entities: unknown): ParsedVCard | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const ent of entities) {
    if (!rolesOf(ent).some((r) => /^abuse$/i.test(r))) continue;
    const v = parseVcard((ent as RdapDoc)?.vcardArray);
    if (v.email?.length || v.tel?.length) return v;
  }
  return undefined;
}

/**
 * The registrar, from every registrar entity: a merged document holds the registry's copy (often
 * just a name and IANA ID) and the registrar's own (URL, address, phone), so later copies with
 * the same IANA ID fill the first one's gaps.
 */
function extractRegistrar(entities: unknown): RegistrarInfo | undefined {
  if (!Array.isArray(entities)) return undefined;
  let info: RegistrarInfo | undefined;
  let abuse: ParsedVCard | undefined;
  for (const ent of entities) {
    if (!rolesOf(ent).some((r) => /registrar/i.test(r))) continue;
    const next = registrarInfo(ent);
    if (info?.ianaId && next.ianaId && info.ianaId !== next.ianaId) continue;
    if (!info) info = next;
    else {
      const record = info as Record<string, unknown>;
      for (const [key, value] of Object.entries(next)) record[key] ??= value;
    }
    abuse ??= nestedAbuseVcard((ent as RdapDoc)?.entities);
  }
  if (!info) return undefined;
  // Fall back to the abuse contact, matching WHOIS "Registrar Abuse Contact Email/Phone"
  info.email ??= abuse?.email?.[0];
  info.phone ??= abuse?.tel?.[0];
  return info;
}

function registrarInfo(ent: unknown): RegistrarInfo {
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
    ...resolveCountry(v.country, v.countryCode),
  };
}

/** Does an RFC 9537 redaction refer to the entity with this RDAP role (e.g. "registrant")? */
function redactionTargetsRole(r: Redaction, role: string): boolean {
  const re = new RegExp(`\\b${role}\\b`, "i");
  return re.test(r.prePath ?? "") || re.test(r.name);
}

const CONTACT_ROLES: Record<string, Contact["type"]> = {
  registrant: "registrant",
  administrative: "admin",
  technical: "tech",
  billing: "billing",
  abuse: "abuse",
  reseller: "reseller",
};

/**
 * One contact per entity and role (an entity may be both administrative and technical), with a
 * registry's and a registrar's copy of the same party combined.
 */
function extractContacts(entities: unknown, redactions?: Redaction[]): Contact[] | undefined {
  if (!Array.isArray(entities)) return undefined;
  const out: Contact[] = [];
  for (const ent of entities) {
    const v = parseVcard((ent as RdapDoc)?.vcardArray);
    const roles = rolesOf(ent)
      .map((r) => r.toLowerCase())
      .filter((r) => CONTACT_ROLES[r]);
    for (const role of new Set(roles)) {
      const contact: Contact = {
        type: CONTACT_ROLES[role] ?? "unknown",
        name: v.fn,
        organization: v.org,
        organizationUnits: v.orgUnits,
        kind: v.kind,
        title: v.title,
        role: v.role,
        email: single(v.email),
        phone: single(v.tel),
        fax: single(v.fax),
        poBox: v.poBox,
        street: v.street,
        city: v.locality,
        state: v.region,
        postalCode: v.postcode,
        country: v.country,
        countryCode: v.countryCode,
      };
      const matching = (redactions ?? []).filter((r) => redactionTargetsRole(r, role));
      // Fields the redaction names, limited to ones actually absent (a present value wasn't hidden).
      const fields = matching
        .flatMap((r) => redactionFields(r.name, r.prePath))
        .filter((f) => !contact[f] || (Array.isArray(contact[f]) && !contact[f]?.length));
      out.push(finalizeContact(contact, fields.length ? fields : matching.length > 0));
    }
  }
  return mergeContacts(out);
}

/** Collapse a list to undefined, a single string, or the array when there are several. */
function single(list: string[] | undefined): string | string[] | undefined {
  if (!list?.length) return undefined;
  return list.length === 1 ? list[0] : list;
}
