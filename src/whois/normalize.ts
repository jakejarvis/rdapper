import { toISO } from "../lib/dates";
import { isPrivacyName } from "../lib/privacy";
import { parseKeyValueLines, uniq } from "../lib/text";
import type {
  Contact,
  DomainRecord,
  Nameserver,
  RegistrarInfo,
} from "../types";

// Common WHOIS availability phrases seen across registries/registrars
const WHOIS_AVAILABLE_PATTERNS: RegExp[] = [
  /\bno match\b/i,
  /\bnot found\b/i,
  /\bno entries found\b/i,
  /\bno data found\b/i,
  /\bavailable for registration\b/i,
  /\bdomain\s+available\b/i,
  /\bdomain status[:\s]+available\b/i,
  /\bobject does not exist\b/i,
  /\bthe queried object does not exist\b/i,
  /\bqueried object does not exist\b/i,
  /\breturned 0 objects\b/i,
  // Common variants across ccTLDs/registrars
  /\bstatus:\s*free\b/i,
  /\bstatus:\s*available\b/i,
  /\bno object found\b/i,
  /\bnicht gefunden\b/i, // German: "not found"
  /\bpending release\b/i, // often signals not registered/being deleted
];

/**
 * Best-effort heuristic to determine if a WHOIS response indicates the domain is available.
 */
export function isAvailableByWhois(text: string | undefined): boolean {
  if (!text) return false;
  return WHOIS_AVAILABLE_PATTERNS.some((re) => re.test(text));
}

/**
 * Convert raw WHOIS text into our normalized DomainRecord.
 * Heuristics cover many gTLD and ccTLD formats; exact fields vary per registry.
 */
export function normalizeWhois(
  domain: string,
  tld: string,
  whoisText: string,
  whoisServer: string | undefined,
  includeRaw = false,
): DomainRecord {
  const map = parseKeyValueLines(whoisText);

  // Date extraction across common synonyms
  const creationDate = anyValue(map, [
    "creation date",
    "created on",
    "created",
    "registered on",
    "registered",
    "registration date",
    "domain registration date",
    "domain create date",
    "domain name commencement date",
    "registration time", // .cn
    "domain record activated", // .edu
    "domain registered",
    "registered date", // .co.jp
    "assigned", // .il
  ]);
  const updatedDate = anyValue(map, [
    "updated date",
    "updated",
    "last updated",
    "last updated on", // .mx
    "last update", // .co.jp
    "last-update", // .fr
    "last modified",
    "modified",
    "changed",
    "modification date",
    "domain record last updated", // .edu
  ]);
  const expirationDate = anyValue(map, [
    "registry expiry date",
    "registry expiration date",
    "registrar registration expiration date",
    "registrar registration expiry date",
    "registrar expiration date",
    "registrar expiry date",
    "expiry date",
    "expiration date",
    "expiry",
    "expire date", // .it
    "expire",
    "expired", // .ly
    "expires on",
    "expires",
    "expiration time", // .cn
    "domain expires", // .edu
    "paid-till",
    "renewal date", // .pl
    "validity", // .il
    "record will expire on",
  ]);

  // Registrar info (thin registries like .com/.net require referral follow for full data)
  const registrar: RegistrarInfo | undefined = (() => {
    const name = anyValue(map, [
      "registrar",
      "registrar name",
      "registrar organization",
      "registrar organization name", // .tr
      "sponsoring registrar",
      "organisation",
      "record maintained by",
    ]);
    const ianaId = anyValue(map, [
      "registrar iana id",
      "sponsoring registrar iana id",
      "iana id",
    ]);
    const url = anyValue(map, [
      "registrar url",
      "registrar website",
      "registrar web", // .it
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
  const statusLines =
    map["domain status"] ||
    map.status ||
    map.flags ||
    map.state || // .ru
    map["registration status"] ||
    map.eppstatus || // .fr
    [];
  const statuses = statusLines.length
    ? statusLines.map((line) => ({ status: line.split(/\s+/)[0], raw: line }))
    : undefined;

  // Nameservers: also appear as "nserver" on some ccTLDs (.de, .ru) and as "name server"
  const nsLines: string[] = [
    ...(map["name server"] || []),
    ...(map.nameserver || []),
    ...(map["name servers"] || []),
    ...(map.nserver || []),
    ...(map["name server information"] || []),
    ...(map.dns || []),
    ...(map.hostname || []),
    ...(map["domain nameservers"] || []),
    ...(map["domain servers in listed order"] || []), // .ly
    ...(map["domain servers"] || []), // .tr
    ...(map["name servers dns"] || []), // .mx
    ...(map["ns 1"] || []),
    ...(map["ns 2"] || []),
    ...(map["ns 3"] || []),
    ...(map["ns 4"] || []),
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

  // Derive privacy flag from registrant name/org keywords
  const registrant = contacts?.find((c) => c.type === "registrant");
  const privacyEnabled = !!(
    registrant &&
    (
      [registrant.name, registrant.organization].filter(Boolean) as string[]
    ).some(isPrivacyName)
  );

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
    isRegistered: !isAvailableByWhois(whoisText),
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
    privacyEnabled: privacyEnabled ? true : undefined,
    whoisServer,
    rdapServers: undefined,
    rawRdap: undefined,
    rawWhois: includeRaw ? whoisText : undefined,
    source: "whois",
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
  const roles: Array<{
    role: Contact["type"];
    prefixes: string[];
  }> = [
    {
      role: "registrant",
      prefixes: ["registrant", "owner", "holder"],
    },
    {
      role: "admin",
      prefixes: ["admin", "administrative"],
    },
    {
      role: "tech",
      prefixes: ["tech", "technical"],
    },
    {
      role: "billing",
      prefixes: ["billing"],
    },
    {
      role: "abuse",
      prefixes: ["abuse"],
    },
  ];
  const contacts: Contact[] = [];
  for (const r of roles) {
    const nameKeys: string[] = [];
    const orgKeys: string[] = [];
    const emailKeys: string[] = [];
    const phoneKeys: string[] = [];
    const faxKeys: string[] = [];
    const streetKeys: string[] = [];
    const cityKeys: string[] = [];
    const stateKeys: string[] = [];
    const postalCodeKeys: string[] = [];
    const countryKeys: string[] = [];

    for (const prefix of r.prefixes) {
      nameKeys.push(`${prefix} name`, `${prefix} contact name`, `${prefix}`);
      if (prefix === "registrant") {
        nameKeys.push("registrant person"); // .ua
      }
      if (prefix === "owner") {
        nameKeys.push("owner name"); // .tm
      }

      orgKeys.push(
        `${prefix} organization`,
        `${prefix} organisation`,
        `${prefix} org`,
      );
      if (prefix === "registrant") {
        orgKeys.push("trading as"); // .uk, .co.uk
        orgKeys.push("org"); // .ru
      }
      if (prefix === "owner") {
        orgKeys.push("owner orgname"); // .tm
      }

      emailKeys.push(
        `${prefix} email`,
        `${prefix} contact email`,
        `${prefix} e-mail`,
      );

      phoneKeys.push(
        `${prefix} phone`,
        `${prefix} contact phone`,
        `${prefix} telephone`,
      );

      faxKeys.push(`${prefix} fax`, `${prefix} facsimile`);

      streetKeys.push(
        `${prefix} street`,
        `${prefix} address`,
        `${prefix}'s address`,
      );
      if (prefix === "owner") {
        streetKeys.push("owner addr"); // .tm
      }

      cityKeys.push(`${prefix} city`);

      stateKeys.push(
        `${prefix} state`,
        `${prefix} province`,
        `${prefix} state/province`,
      );

      postalCodeKeys.push(
        `${prefix} postal code`,
        `${prefix} postcode`,
        `${prefix} zip`,
      );

      countryKeys.push(`${prefix} country`);
    }

    const name = anyValue(map, nameKeys);
    const org = anyValue(map, orgKeys);
    const email = anyValue(map, emailKeys);
    const phone = anyValue(map, phoneKeys);
    const fax = anyValue(map, faxKeys);
    const street = multi(map, streetKeys);
    const city = anyValue(map, cityKeys);
    const state = anyValue(map, stateKeys);
    const postalCode = anyValue(map, postalCodeKeys);
    const country = anyValue(map, countryKeys);

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
