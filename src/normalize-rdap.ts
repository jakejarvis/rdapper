import type {
  Contact,
  DomainRecord,
  Nameserver,
  RegistrarInfo,
} from "./types.js";
import { toISO, uniq } from "./utils.js";

/**
 * Convert RDAP JSON into our normalized DomainRecord.
 * This function is defensive: RDAP servers vary in completeness and field naming.
 */
export function normalizeRdap(
  inputDomain: string,
  tld: string,
  rdap: any,
  rdapServersTried: string[],
  fetchedAtISO: string,
): DomainRecord {
  // Safe helpers for optional fields
  const get = (obj: any, path: string[]): any =>
    path.reduce((o, k) => (o && k in o ? o[k] : undefined), obj);

  // Prefer ldhName (punycode) and unicodeName if provided
  const ldhName: string | undefined =
    rdap?.ldhName || rdap?.handle || undefined;
  const unicodeName: string | undefined = rdap?.unicodeName || undefined;

  // Registrar entity can be provided with role "registrar"
  const registrar: RegistrarInfo | undefined = extractRegistrar(rdap?.entities);

  // Nameservers: normalize host + IPs
  const nameservers: Nameserver[] | undefined = Array.isArray(rdap?.nameservers)
    ? rdap.nameservers
        .map((ns: any) => ({
          host: ns?.ldhName || ns?.unicodeName || "",
          ipv4: get(ns, ["ipAddresses", "v4"]) || undefined,
          ipv6: get(ns, ["ipAddresses", "v6"]) || undefined,
        }))
        .filter((n: Nameserver) => !!n.host)
    : undefined;

  // Contacts: RDAP entities include roles like registrant, administrative, technical, billing, abuse
  const contacts: Contact[] | undefined = extractContacts(rdap?.entities);

  // RDAP uses IANA EPP status values. Preserve raw plus a description if any remarks are present.
  const statuses = Array.isArray(rdap?.status)
    ? rdap.status.map((s: string) => ({ status: s, raw: s }))
    : undefined;

  // Secure DNS info
  const secureDNS = rdap?.secureDNS;
  const dnssec = secureDNS
    ? {
        enabled: !!secureDNS.delegationSigned,
        dsRecords: Array.isArray(secureDNS.dsData)
          ? secureDNS.dsData.map((d: any) => ({
              keyTag: d.keyTag,
              algorithm: d.algorithm,
              digestType: d.digestType,
              digest: d.digest,
            }))
          : undefined,
      }
    : undefined;

  // RDAP "events" contain timestamps for registration, last changed, expiration, deletion, etc.
  const events: any[] = Array.isArray(rdap?.events) ? rdap.events : [];
  const byAction = (action: string) =>
    events.find(
      (e) =>
        typeof e?.eventAction === "string" &&
        e.eventAction.toLowerCase().includes(action),
    );
  const creationDate = toISO(
    byAction("registration")?.eventDate || rdap?.registrationDate,
  );
  const updatedDate = toISO(
    byAction("last changed")?.eventDate || rdap?.lastChangedDate,
  );
  const expirationDate = toISO(
    byAction("expiration")?.eventDate || rdap?.expirationDate,
  );
  const deletionDate = toISO(
    byAction("deletion")?.eventDate || rdap?.deletionDate,
  );

  // Derive a simple transfer lock flag from statuses
  const transferLock = !!statuses?.some((s: { status: string }) =>
    /transferprohibited/i.test(s.status),
  );

  // The RDAP document may include "port43" pointer to authoritative WHOIS
  const whoisServer: string | undefined =
    typeof rdap?.port43 === "string" ? rdap.port43 : undefined;

  const record: DomainRecord = {
    domain: unicodeName || ldhName || inputDomain,
    tld,
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
    whoisServer,
    rdapServers: rdapServersTried,
    rawRdap: rdap,
    rawWhois: undefined,
    source: "rdap",
    fetchedAt: fetchedAtISO,
    warnings: undefined,
  };

  return record;
}

function extractRegistrar(
  entities: any[] | undefined,
): RegistrarInfo | undefined {
  if (!Array.isArray(entities)) return undefined;
  for (const ent of entities) {
    const roles: string[] = Array.isArray(ent?.roles) ? ent.roles : [];
    if (!roles.some((r) => /registrar/i.test(r))) continue;
    const v = parseVcard(ent?.vcardArray);
    const ianaId = Array.isArray(ent?.publicIds)
      ? ent.publicIds.find((id: any) => /iana\s*registrar\s*id/i.test(id?.type))
          ?.identifier
      : undefined;
    return {
      name: v.fn || v.org || ent?.handle || undefined,
      ianaId: ianaId,
      url: v.url,
      email: v.email,
      phone: v.tel,
    };
  }
  return undefined;
}

function extractContacts(entities: any[] | undefined): Contact[] | undefined {
  if (!Array.isArray(entities)) return undefined;
  const out: Contact[] = [];
  for (const ent of entities) {
    const roles: string[] = Array.isArray(ent?.roles) ? ent.roles : [];
    const v = parseVcard(ent?.vcardArray);
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
    const roleKey = (
      type.toLowerCase() in map ? (map as any)[type.toLowerCase()] : "unknown"
    ) as Contact["type"];
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

// Parse a minimal subset of vCard 4.0 arrays as used in RDAP "vcardArray" fields
function parseVcard(vcardArray: any): Record<string, any> {
  // vcardArray is typically ["vcard", [["version",{},"text","4.0"], ["fn",{},"text","Example"], ...]]
  if (
    !Array.isArray(vcardArray) ||
    vcardArray[0] !== "vcard" ||
    !Array.isArray(vcardArray[1])
  )
    return {};
  const entries: any[] = vcardArray[1];
  const out: Record<string, any> = {};
  for (const e of entries) {
    const key = e?.[0];
    const _valueType = e?.[2];
    const value = e?.[3];
    if (!key) continue;
    switch (String(key).toLowerCase()) {
      case "fn":
        out.fn = value;
        break;
      case "org":
        out.org = Array.isArray(value) ? value.join(" ") : value;
        break;
      case "email":
        out.email = value;
        break;
      case "tel":
        out.tel = value;
        break;
      case "url":
        out.url = value;
        break;
      case "adr": {
        // adr value is [postOfficeBox, extendedAddress, street, locality, region, postalCode, country]
        if (Array.isArray(value)) {
          out.street = value[2]
            ? String(value[2]).split(/\\n|,\s*/)
            : undefined;
          out.locality = value[3];
          out.region = value[4];
          out.postcode = value[5];
          out.country = value[6];
        }
        break;
      }
    }
  }
  // Best effort country code from country name (often omitted). Leaving undefined unless explicitly provided.
  return out;
}
