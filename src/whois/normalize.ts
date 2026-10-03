import { toISOFromTokens } from "../lib/dates";
import { finalizeContact, isPrivacyContact } from "../lib/contacts";
import { mergeNameservers } from "../lib/nameservers";
import { isEppStatus, normalizeEppStatus } from "../lib/status";
import { parseKeyValueBlocks, parseKeyValueLines, uniqBy } from "../lib/text";
import type { Contact, DomainRecord, Nameserver, RegistrarInfo } from "../types";

// Phrases registries use to say a name is not registered. They also turn up in the remarks and
// footers of real records ("only available for registration under certain conditions" on .ir,
// "Registrant Fax: not found", "This WHOIS service is free of charge"), so they count only when
// the reply carries no registration data.
const WHOIS_AVAILABLE_PHRASES: RegExp[] = [
  /\bno match\b/i,
  /\bnot found\b/i,
  /\bno entries found\b/i,
  /\bno data found\b/i,
  /\bno information available\b/i,
  /\bno information was found\b/i,
  /\bno data was found\b/i,
  /\bavailable for registration\b/i,
  /\bdomain\s+available\b/i,
  /\bobject does not exist\b/i,
  /\bthe queried object does not exist\b/i,
  /\bqueried object does not exist\b/i,
  /\bdoes not exist\b/i,
  /\breturned 0 objects\b/i,
  /\bnot been registered\b/i,
  /\bunassignable\b/i,
  /\bis free\b/i,
  // Common variants across ccTLDs/registrars
  /\bno object found\b/i,
  /\bobject_not_found\b/i,
  /\bno se encuentra registrado\b/i, // Spanish: "not found registered"
  /\bnicht gefunden\b/i, // German: "not found"
];

// Statuses that mark a name unregistered even though the record still carries data, as a name
// being released keeps its old dates and nameservers
const WHOIS_AVAILABLE_STATUSES: RegExp[] = [
  /\bdomain status[:\s]+available\b/i,
  /\bstatus:\s*free\b/i,
  /\bstatus:\s*available\b/i,
  /\bpending release\b/i, // often signals not registered/being deleted
  /\brelease process:\s*waiting\b/i, // .br: expired, awaiting release
];

/**
 * Best-effort heuristic to determine if a WHOIS response indicates the domain is available.
 */
export function isAvailableByWhois(text: string | undefined): boolean {
  if (!text) return false;
  return !normalizeWhois("", "", text, undefined).isRegistered;
}

/** Whether a reply says the name is unregistered, given whether it carries registration data. */
function saysAvailable(text: string, hasRegistrationData: boolean): boolean {
  if (WHOIS_AVAILABLE_STATUSES.some((re) => re.test(text))) return true;
  return !hasRegistrationData && WHOIS_AVAILABLE_PHRASES.some((re) => re.test(text));
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
  const blocks = parseKeyValueBlocks(whoisText);

  // Date extraction across common synonyms. The domain's own block comes first, so an earlier
  // block beats a higher-priority key in a later one: FRED registries (.cz, .mk) repeat "created"
  // in every contact and nameserver block. The whole-reply map covers a header whose value sits
  // past a blank line.
  const dateOf = (keys: string[], latest = false) =>
    firstDate(blocks, keys, latest) ?? firstDate([map], keys, latest);
  // .gg/.je list dates as sentences under "Relevant dates:", e.g. "Registered on 28th December 2018 at 05:54:43.861"
  const relevantDate = (label: RegExp) =>
    toISOFromTokens(map["relevant dates"]?.find((l) => label.test(l))?.replace(label, ""));
  // .tw writes "Record created on 2000-02-02 15:06:48 (UTC+8)", with no key separator
  const recordDate = (label: RegExp) => toISOFromTokens(whoisText.match(label)?.[1]);
  const creationDate =
    dateOf([
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
      "registered date", // .co.jp, .kr
      "created date", // .th
      "assigned", // .il
    ]) ??
    relevantDate(/^registered on\s+/i) ??
    recordDate(/^[ \t]*Record created on[ \t]+(.+?)\.?$/im);
  const updatedDate =
    dateOf(
      [
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
        "last updated date", // .kr
        "update date", // .by
        "domain record last updated", // .edu
      ],
      true,
    ) ?? recordDate(/^[ \t]*Record last updated on[ \t]+(.+?)\.?$/im);
  const expirationDate =
    dateOf([
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
      "exp date", // .th
      "valid until", // .sk
    ]) ?? recordDate(/^[ \t]*Record expires on[ \t]+(.+?)\.?$/im);

  // Registrar info (thin registries like .com/.net require referral follow for full data)
  const registrar: RegistrarInfo | undefined = (() => {
    const name = anyValue(map, [
      "registrar",
      // Before "registrar name": .it's "Registrar" section has the handle under Name
      "registrar organization",
      "registrar name",
      "registrar organization name", // .tr
      "sponsoring registrar",
      "organisation",
      "record maintained by",
      "registration service provider", // .tw
    ]);
    const ianaId = anyValue(map, ["registrar iana id", "sponsoring registrar iana id", "iana id"]);
    const url = anyValue(map, [
      "registrar url",
      "registrar website",
      "registrar web", // .it
      "url of the registrar",
      "registration service url", // .tw
      "referrer",
    ]);
    const abuseEmail = anyValue(map, ["registrar abuse contact email", "abuse contact email"]);
    const abusePhone = anyValue(map, ["registrar abuse contact phone", "abuse contact phone"]);
    // .gg/.je: "epag (http://www.epag.de)"
    const inlineUrl = name?.match(/^(.*?)\s*\((https?:\/\/[^)\s]+)\)$/);
    if (inlineUrl?.[1] && !url) {
      return { name: inlineUrl[1], url: inlineUrl[2] };
    }
    if (!name && !ianaId && !url && !abuseEmail && !abusePhone) return undefined;
    return {
      name: name || undefined,
      ianaId: ianaId || undefined,
      url: url || undefined,
      email: abuseEmail || undefined,
      phone: abusePhone || undefined,
    };
  })();

  // Statuses come from the first block that lists any, as contact blocks repeat "status:" (.ua,
  // .fr). .be lists its EPP statuses under a separate "Flags:" header.
  const statusLines = [
    ...(statusLinesOf(blocks) ?? statusLinesOf([map], false) ?? []),
    ...blocks.flatMap((b) => b.flags ?? []).filter((f) => isEppStatus(f)),
  ];
  const statuses = statusLines.length
    ? uniqBy(
        statusLines.flatMap((line) =>
          parseStatusLine(line).map((status) => ({ status, raw: line })),
        ),
        (s) => s.status.toLowerCase(),
      )
    : undefined;

  // Some registries (.ua) publish expiry only as a status, e.g. "OK-UNTIL 20261004161638"
  const okUntil = statuses?.find((s) => /^ok-until$/i.test(s.status))?.raw;

  // Nameservers: also appear as "nserver" on some ccTLDs (.de, .ru) and as "name server"
  const nsLines: string[] = [
    ...NAMESERVER_KEYS.flatMap((k) => map[k] ?? []),
    // "NS 1" ... "NS 8" (.tm)
    ...Object.keys(map)
      .filter((k) => /^ns \d+$/.test(k))
      .flatMap((k) => map[k] ?? []),
  ];
  const nameservers = mergeNameservers(
    nsLines.map((line) => parseNameserverLine(line, domain)).filter((x): x is Nameserver => !!x),
  );

  // Contacts: best-effort parse common keys
  const contacts = collectContacts(map);

  // Derive privacy flag from registrant name/org keywords
  const registrant = contacts?.find((c) => c.type === "registrant");
  const privacyEnabled = isPrivacyContact(registrant);

  // "signedDelegation", "Signed delegation", "yes", "active" (.bg, .md), "서명" (.kr); not
  // "unsigned" or "Inactive". Read from the first block that has it, preferring "Signed": .it's
  // registrar section has "DNSSEC: yes" for the registrar's support, beside the domain's
  // "Signed: no".
  const dnssecValues = valuesOf(blocks, ["signed", "dnssec signed", "dnssec"]); // "dnssec signed": .rs
  const dnssec = dnssecValues
    ? { enabled: dnssecValues.some((v) => /^(?:signed|yes|true|active|서명)/i.test(v.trim())) }
    : undefined;

  // Simple lock derivation from statuses (the EPP code, or the registry's wording in raw)
  const transferLock = !!statuses?.some((s) =>
    /transfer[-\s]*prohibited/i.test(`${s.status} ${s.raw ?? ""}`),
  );

  const record: DomainRecord = {
    domain,
    tld,
    isRegistered: !saysAvailable(
      whoisText,
      !!(creationDate || expirationDate || registrar || nameservers?.length),
    ),
    isIDN: /(^|\.)xn--/i.test(domain),
    unicodeName: undefined,
    punycodeName: undefined,
    registry: undefined,
    registrar,
    reseller: anyValue(map, ["reseller", "reseller name"]) || undefined, // "reseller name": .au, .th
    statuses,
    creationDate,
    updatedDate,
    expirationDate: expirationDate ?? toISOFromTokens(okUntil),
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

const NAMESERVER_KEYS = [
  "name server",
  "nameserver",
  "name servers",
  "nameservers", // .pl, .be, .it
  "nserver",
  "name server information",
  "name servers information", // .hk
  "dns",
  "hostname",
  "host name", // .kr
  "domain nameservers",
  "domain servers in listed order", // .ly
  "domain servers", // .tr
  "name servers dns", // .mx
];

/**
 * One nameserver line: the host, then glue in whatever shape the registry uses ("192.0.2.1
 * 2001:db8::1", "(192.0.2.1)", "[192.0.2.1,2001:db8::1]" (.lu), "- 192.0.2.1" (.rs),
 * "| IPv4: 192.0.2.1 and IPv6: 2001:db8::1" (.pt)). Undefined when the line doesn't start
 * with a hostname ("-" on .lv) or names the queried domain itself (.dk's "DNS:" line).
 */
function parseNameserverLine(line: string, domain: string): Nameserver | undefined {
  const [first = "", ...rest] = line.split(/[\s,;()[\]|]+/).filter(Boolean);
  const host = first.toLowerCase().replace(/\.$/, "");
  if (!/^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u.test(host) || host === domain.toLowerCase()) {
    return undefined;
  }
  const ipv4 = rest.filter((t) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(t));
  const ipv6 = rest.filter((t) => /^[0-9a-f]*(?::[0-9a-f]*){2,7}$/i.test(t));
  const ns: Nameserver = { host };
  if (ipv4.length) ns.ipv4 = ipv4;
  if (ipv6.length) ns.ipv6 = ipv6;
  return ns;
}

/** Values of the first key (by priority) present in the first block that has any of them. */
function valuesOf(blocks: Array<Record<string, string[]>>, keys: string[]): string[] | undefined {
  for (const block of blocks) {
    const key = keys.find((k) => block[k]?.length);
    if (key) return block[key];
  }
  return undefined;
}

// Status keys by preference: .fr lists EPP codes as "eppstatus" beside a plain "status: ACTIVE"
const STATUS_KEYS = ["eppstatus", "domain status", "status", "registration status"];

/**
 * Status lines of the first block that has any. "state" is .ru's status key but a contact's
 * region elsewhere ("State: Nuevo Leon" on .mx), so it only counts beside the domain line.
 */
function statusLinesOf(
  blocks: Array<Record<string, string[]>>,
  allowState = true,
): string[] | undefined {
  for (const block of blocks) {
    const key = STATUS_KEYS.find((k) => block[k]?.length);
    if (key) return block[key];
    if (allowState && block.state?.length && (block.domain || block["domain name"])) {
      return block.state;
    }
  }
  return undefined;
}

// FRED registries (.cz, .mk, ...) describe server statuses in words
const FRED_STATUSES: Record<string, string> = {
  "sponsoring registrar change forbidden": "serverTransferProhibited",
  "deletion forbidden": "serverDeleteProhibited",
  "update forbidden": "serverUpdateProhibited",
};

/**
 * Statuses in one WHOIS status line, as EPP codes where they have one, otherwise as the
 * registry's own phrase: "clientTransferProhibited https://icann.org/epp#...", "ok (paid and in
 * zone)", "REGISTERED, DELEGATED, VERIFIED", "Transfer Locked", "OK-UNTIL 20261004161638".
 */
function parseStatusLine(line: string): string[] {
  const phrase = line.replace(/\s*(?:\(?https?:\/\/\S*\)?|\(.*\)).*$/, "");
  return phrase
    .split(",")
    .map((part) => {
      const p = part.trim().replace(/\.$/, "");
      if (isEppStatus(p)) return normalizeEppStatus(p);
      // A trailing date explains the status rather than naming it (.ua "OK-UNTIL <date>")
      return FRED_STATUSES[p.toLowerCase()] ?? p.replace(/(?:\s+\d\S*)+$/, "");
    })
    .filter(Boolean);
}

/**
 * First value that parses as a date, taking blocks in order and keys by priority within each.
 * With `latest`, the latest of the first matching key's values instead (.il lists every
 * "changed:" line, oldest first).
 */
function firstDate(
  blocks: Array<Record<string, string[]>>,
  keys: string[],
  latest = false,
): string | undefined {
  for (const block of blocks) {
    for (const k of keys) {
      const dates = (block[k] ?? []).map((v) => toISOFromTokens(v)).filter((d) => d !== undefined);
      if (dates.length) return latest ? dates.sort().at(-1) : dates[0];
    }
  }
  return undefined;
}

function anyValue(map: Record<string, string[]>, keys: string[]): string | undefined {
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

      orgKeys.push(`${prefix} organization`, `${prefix} organisation`, `${prefix} org`);
      if (prefix === "registrant") {
        orgKeys.push("trading as"); // .uk, .co.uk
        orgKeys.push("org"); // .ru
      }
      if (prefix === "owner") {
        orgKeys.push("owner orgname"); // .tm
      }

      emailKeys.push(`${prefix} email`, `${prefix} contact email`, `${prefix} e-mail`);

      phoneKeys.push(`${prefix} phone`, `${prefix} contact phone`, `${prefix} telephone`);

      faxKeys.push(`${prefix} fax`, `${prefix} facsimile`);

      streetKeys.push(`${prefix} street`, `${prefix} address`, `${prefix}'s address`);
      if (prefix === "owner") {
        streetKeys.push("owner addr"); // .tm
      }

      cityKeys.push(`${prefix} city`);

      stateKeys.push(`${prefix} state`, `${prefix} province`, `${prefix} state/province`);

      postalCodeKeys.push(`${prefix} postal code`, `${prefix} postcode`, `${prefix} zip`);

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
      contacts.push(
        finalizeContact({
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
        }),
      );
    }
  }
  return contacts.length ? contacts : undefined;
}

function multi(map: Record<string, string[]>, keys: string[]): string[] | undefined {
  for (const k of keys) {
    const v = map[k];
    if (v?.length) return v;
  }
  return undefined;
}
