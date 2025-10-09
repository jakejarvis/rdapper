import { toISO } from "../lib/dates";
import { isPrivacyName } from "../lib/privacy";
import { asDateLike, asString, asStringArray, uniq } from "../lib/text";
import type {
  Contact,
  DomainRecord,
  Nameserver,
  RegistrarInfo,
} from "../types";

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
  fetchedAtISO: string,
  includeRaw = false,
): DomainRecord {
  const doc = (rdap ?? {}) as RdapDoc;

  // Prefer ldhName (punycode) and unicodeName if provided
  const ldhName: string | undefined =
    asString(doc.ldhName) || asString(doc.handle);
  const unicodeName: string | undefined = asString(doc.unicodeName);

  // Registrar entity can be provided with role "registrar"
  const registrar: RegistrarInfo | undefined = extractRegistrar(
    doc.entities as unknown,
  );

  // Nameservers: normalize host + IPs
  const nameservers: Nameserver[] | undefined = Array.isArray(doc.nameservers)
    ? (doc.nameservers as RdapDoc[])
        .map((ns) => {
          const host = (
            asString(ns.ldhName) ??
            asString(ns.unicodeName) ??
            ""
          ).toLowerCase();
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

  // Contacts: RDAP entities include roles like registrant, administrative, technical, billing, abuse
  const contacts: Contact[] | undefined = extractContacts(
    doc.entities as unknown,
  );

  // Derive privacy flag from registrant name/org keywords
  const registrant = contacts?.find((c) => c.type === "registrant");
  const privacyEnabled = !!(
    registrant &&
    (
      [registrant.name, registrant.organization].filter(Boolean) as string[]
    ).some(isPrivacyName)
  );

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
  const byAction = (action: string) =>
    events.find(
      (e) =>
        typeof e?.eventAction === "string" &&
        e.eventAction.toLowerCase().includes(action),
    );
  const creationDate = toISO(
    asDateLike(byAction("registration")?.eventDate) ??
      asDateLike(doc.registrationDate),
  );
  const updatedDate = toISO(
    asDateLike(byAction("last changed")?.eventDate) ??
      asDateLike(doc.lastChangedDate),
  );
  const expirationDate = toISO(
    asDateLike(byAction("expiration")?.eventDate) ??
      asDateLike(doc.expirationDate),
  );
  const deletionDate = toISO(
    asDateLike(byAction("deletion")?.eventDate) ?? asDateLike(doc.deletionDate),
  );

  // Derive a simple transfer lock flag from statuses
  const transferLock = !!statuses?.some((s: { status: string }) =>
    /transferprohibited/i.test(s.status),
  );

  // The RDAP document may include "port43" pointer to authoritative WHOIS
  const whoisServer: string | undefined = asString(doc.port43);

  const record: DomainRecord = {
    domain: unicodeName || ldhName || inputDomain,
    tld,
    isRegistered: true,
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
    whoisServer,
    rdapServers: rdapServersTried,
    rawRdap: includeRaw ? rdap : undefined,
    rawWhois: undefined,
    source: "rdap",
    fetchedAt: fetchedAtISO,
    warnings: undefined,
  };

  return record;
}

function extractRegistrar(entities: unknown): RegistrarInfo | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const ent of entities) {
    const roles: string[] = Array.isArray((ent as RdapDoc)?.roles)
      ? ((ent as RdapDoc).roles as unknown[]).filter(
          (r): r is string => typeof r === "string",
        )
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
      email: v.email ?? undefined,
      phone: v.tel ?? undefined,
    };
  }
  return undefined;
}

function extractContacts(entities: unknown): Contact[] | undefined {
  if (!Array.isArray(entities)) return undefined;
  const out: Contact[] = [];
  for (const ent of entities) {
    const roles: string[] = Array.isArray((ent as RdapDoc)?.roles)
      ? ((ent as RdapDoc).roles as unknown[]).filter(
          (r): r is string => typeof r === "string",
        )
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
    out.push({
      type: roleKey,
      name: v.fn,
      organization: v.org,
      email: v.email,
      phone: v.tel,
      fax: v.fax,
      street: v.street,
      city: v.locality,
      state: v.region,
      postalCode: v.postcode,
      country: v.country,
      countryCode: v.countryCode,
    });
  }
  return out.length ? out : undefined;
}

interface ParsedVCard {
  fn?: string;
  org?: string;
  email?: string;
  tel?: string;
  fax?: string;
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
  if (
    !Array.isArray(vcardArray) ||
    vcardArray[0] !== "vcard" ||
    !Array.isArray(vcardArray[1])
  )
    return {};
  const entries = vcardArray[1] as Array<
    [string, Record<string, unknown>, string, unknown]
  >;
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
        out.org = Array.isArray(value)
          ? value.map((x) => String(x)).join(" ")
          : asString(value);
        break;
      case "email":
        out.email = asString(value);
        break;
      case "tel":
        out.tel = asString(value);
        break;
      case "url":
        out.url = asString(value);
        break;
      case "adr": {
        // adr value is [postOfficeBox, extendedAddress, street, locality, region, postalCode, country]
        if (Array.isArray(value)) {
          out.street = value[2] ? String(value[2]).split(/\n|,\s*/) : undefined;
          out.locality = asString(value[3]);
          out.region = asString(value[4]);
          out.postcode = asString(value[5]);
          out.country = asString(value[6]);
        }
        break;
      }
    }
  }
  // Best effort country code from country name (often omitted). Leaving undefined unless explicitly provided.
  return out;
}
