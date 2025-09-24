import { toISO } from "../lib/dates.js";
import { isWhoisAvailable } from "../lib/domain.js";
import { parseKeyValueLines, uniq } from "../lib/text.js";
import type {
  Contact,
  DomainRecord,
  Nameserver,
  RegistrarInfo,
} from "../types.js";

/**
 * Convert raw WHOIS text into our normalized DomainRecord.
 * Heuristics cover many gTLD and ccTLD formats; exact fields vary per registry.
 */
export function normalizeWhois(
  domain: string,
  tld: string,
  whoisText: string,
  whoisServer: string | undefined,
  fetchedAtISO: string,
): DomainRecord {
  const map = parseKeyValueLines(whoisText);

  // Date extraction across common synonyms
  const creationDate = anyValue(map, [
    "creation date",
    "created on",
    "registered on",
    "domain registration date",
    "domain create date",
    "created",
    "registered",
  ]);
  const updatedDate = anyValue(map, [
    "updated date",
    "last updated",
    "last modified",
    "modified",
  ]);
  const expirationDate = anyValue(map, [
    "registry expiry date",
    "expiry date",
    "expiration date",
    "paid-till",
    "expires on",
    "renewal date",
  ]);

  // Registrar info (thin registries like .com/.net require referral follow for full data)
  const registrar: RegistrarInfo | undefined = (() => {
    const name = anyValue(map, [
      "registrar",
      "sponsoring registrar",
      "registrar name",
    ]);
    const ianaId = anyValue(map, ["registrar iana id", "iana id"]);
    const url = anyValue(map, [
      "registrar url",
      "url of the registrar",
      "referrer",
    ]);
    const abuseEmail = anyValue(map, [
      "registrar abuse contact email",
      "abuse contact email",
    ]);
    const abusePhone = anyValue(map, [
      "registrar abuse contact phone",
      "abuse contact phone",
    ]);
    if (!name && !ianaId && !url && !abuseEmail && !abusePhone)
      return undefined;
    return {
      name: name || undefined,
      ianaId: ianaId || undefined,
      url: url || undefined,
      email: abuseEmail || undefined,
      phone: abusePhone || undefined,
    };
  })();

  // Statuses: multiple entries are expected; keep raw
  const statusLines = map["domain status"] || map.status || [];
  const statuses = statusLines.length
    ? statusLines.map((line) => ({ status: line.split(/\s+/)[0], raw: line }))
    : undefined;

  // Nameservers: also appear as "nserver" on some ccTLDs (.de, .ru) and as "name server"
  const nsLines: string[] = [
    ...(map["name server"] || []),
    ...(map.nameserver || []),
    ...(map["name servers"] || []),
    ...(map.nserver || []),
  ];
  const nameservers: Nameserver[] | undefined = nsLines.length
    ? (uniq(
        nsLines
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            // Common formats: "ns1.example.com" or "ns1.example.com 192.0.2.1" or "ns1.example.com 2001:db8::1"
            const parts = line.split(/\s+/);
            const host = parts.shift()?.toLowerCase() || "";
            const ipv4: string[] = [];
            const ipv6: string[] = [];
            for (const p of parts) {
              if (/^\d+\.\d+\.\d+\.\d+$/.test(p)) ipv4.push(p);
              else if (/^[0-9a-f:]+$/i.test(p)) ipv6.push(p);
            }
            if (!host) return undefined;
            const ns: Nameserver = { host };
            if (ipv4.length) ns.ipv4 = ipv4;
            if (ipv6.length) ns.ipv6 = ipv6;
            return ns;
          })
          .filter((x): x is Nameserver => !!x),
      ) as Nameserver[])
    : undefined;

  // Contacts: best-effort parse common keys
  const contacts = collectContacts(map);

  const dnssecRaw = (map.dnssec?.[0] || "").toLowerCase();
  const dnssec = dnssecRaw
    ? { enabled: /signed|yes|true/.test(dnssecRaw) }
    : undefined;

  // Simple lock derivation from statuses
  const transferLock = !!statuses?.some((s) =>
    /transferprohibited/i.test(s.status),
  );

  const record: DomainRecord = {
    domain,
    tld,
    isRegistered: !isWhoisAvailable(whoisText),
    isIDN: /(^|\.)xn--/i.test(domain),
    unicodeName: undefined,
    punycodeName: undefined,
    registry: undefined,
    registrar,
    reseller: anyValue(map, ["reseller"]) || undefined,
    statuses,
    creationDate: toISO(creationDate || undefined),
    updatedDate: toISO(updatedDate || undefined),
    expirationDate: toISO(expirationDate || undefined),
    deletionDate: undefined,
    transferLock,
    dnssec,
    nameservers,
    contacts,
    whoisServer,
    rdapServers: undefined,
    rawRdap: undefined,
    rawWhois: whoisText,
    source: "whois",
    fetchedAt: fetchedAtISO,
    warnings: undefined,
  };

  return record;
}

function anyValue(
  map: Record<string, string[]>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = map[k];
    if (v?.length) return v[0];
  }
  return undefined;
}

function collectContacts(map: Record<string, string[]>): Contact[] | undefined {
  const roles: Array<{ role: Contact["type"]; prefix: string }> = [
    { role: "registrant", prefix: "registrant" },
    { role: "admin", prefix: "admin" },
    { role: "tech", prefix: "tech" },
    { role: "billing", prefix: "billing" },
    { role: "abuse", prefix: "abuse" },
  ];
  const contacts: Contact[] = [];
  for (const r of roles) {
    const name = anyValue(map, [
      `${r.prefix} name`,
      `${r.prefix} contact name`,
      `${r.prefix}`,
    ]);
    const org = anyValue(map, [`${r.prefix} organization`, `${r.prefix} org`]);
    const email = anyValue(map, [
      `${r.prefix} email`,
      `${r.prefix} contact email`,
      `${r.prefix} e-mail`,
    ]);
    const phone = anyValue(map, [
      `${r.prefix} phone`,
      `${r.prefix} contact phone`,
      `${r.prefix} telephone`,
    ]);
    const fax = anyValue(map, [`${r.prefix} fax`, `${r.prefix} facsimile`]);
    const street = multi(map, [`${r.prefix} street`, `${r.prefix} address`]);
    const city = anyValue(map, [`${r.prefix} city`]);
    const state = anyValue(map, [
      `${r.prefix} state`,
      `${r.prefix} province`,
      `${r.prefix} state/province`,
    ]);
    const postalCode = anyValue(map, [
      `${r.prefix} postal code`,
      `${r.prefix} postcode`,
      `${r.prefix} zip`,
    ]);
    const country = anyValue(map, [`${r.prefix} country`]);
    if (name || org || email || phone || street?.length) {
      contacts.push({
        type: r.role,
        name: name || undefined,
        organization: org || undefined,
        email: email || undefined,
        phone: phone || undefined,
        fax: fax || undefined,
        street: street,
        city: city || undefined,
        state: state || undefined,
        postalCode: postalCode || undefined,
        country: country || undefined,
      });
    }
  }
  return contacts.length ? contacts : undefined;
}

function multi(
  map: Record<string, string[]>,
  keys: string[],
): string[] | undefined {
  for (const k of keys) {
    const v = map[k];
    if (v?.length) return v;
  }
  return undefined;
}
