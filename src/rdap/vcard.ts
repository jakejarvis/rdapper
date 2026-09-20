import { asString } from "../lib/text";

/** One property of a jCard (RFC 7095): [name, params, valueType, ...values]. */
export interface VCardProp {
  name: string;
  params: Record<string, unknown>;
  valueType: string;
  value: unknown;
}

export type VCardKind = "individual" | "org" | "group" | "location";

const KINDS: readonly string[] = ["individual", "org", "group", "location"];

/** Flatten an RDAP "vcardArray" into a property list. Tolerates malformed input. */
export function readJCard(vcardArray: unknown): VCardProp[] {
  // vcardArray is ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Example"], ...]]
  if (!Array.isArray(vcardArray) || vcardArray[0] !== "vcard" || !Array.isArray(vcardArray[1])) {
    return [];
  }
  const out: VCardProp[] = [];
  for (const raw of vcardArray[1] as unknown[]) {
    if (!Array.isArray(raw) || typeof raw[0] !== "string") continue;
    const params = raw[1] && typeof raw[1] === "object" ? (raw[1] as Record<string, unknown>) : {};
    out.push({
      name: raw[0].toLowerCase(),
      params,
      valueType: typeof raw[2] === "string" ? raw[2].toLowerCase() : "text",
      value: raw[3],
    });
  }
  return out;
}

/** A jCard parameter (e.g. TYPE) as a lowercase string list; it may be a string or an array. */
export function paramList(param: unknown): string[] {
  const list = Array.isArray(param) ? param : param === undefined ? [] : [param];
  return list.filter((x) => typeof x === "string").map((x) => (x as string).toLowerCase());
}

/** Element `i` of a structured value, as a non-empty string. */
export function part(value: unknown, i: number): string | undefined {
  return Array.isArray(value) ? asString(value[i]) || undefined : undefined;
}

/** Text value; `tel:` URIs (RFC 6350 allows TEL as uri) are reduced to the number. */
function textValue(p: VCardProp): string | undefined {
  const v = asString(p.value);
  if (!v) return undefined;
  return p.valueType === "uri" || /^tel:/i.test(v) ? v.replace(/^tel:/i, "") : v;
}

export interface ParsedVCard {
  fn?: string;
  kind?: VCardKind;
  /** First ORG level: the organization name */
  org?: string;
  /** Remaining ORG levels (organizational units) */
  orgUnits?: string[];
  title?: string;
  role?: string;
  email?: string[];
  tel?: string[];
  fax?: string[];
  url?: string;
  poBox?: string;
  street?: string[];
  locality?: string;
  region?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
}

const lines = (s: string | undefined) => (s ? s.split(/\r?\n/).filter(Boolean) : []);

/** Extract the fields rdapper cares about from an RDAP "vcardArray". */
export function parseVcard(vcardArray: unknown): ParsedVCard {
  const out: ParsedVCard = {};
  for (const p of readJCard(vcardArray)) {
    switch (p.name) {
      case "fn":
        out.fn ??= asString(p.value);
        break;
      case "kind": {
        const k = asString(p.value)?.toLowerCase();
        if (k && KINDS.includes(k)) out.kind ??= k as VCardKind;
        break;
      }
      case "org": {
        if (out.org !== undefined) break;
        // ORG is structured: a string, or [name, unit, unit, ...]
        const levels = (Array.isArray(p.value) ? p.value : [p.value])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean);
        if (levels.length) {
          out.org = levels[0];
          if (levels.length > 1) out.orgUnits = levels.slice(1);
        }
        break;
      }
      case "title":
        out.title ??= asString(p.value);
        break;
      case "role":
        out.role ??= asString(p.value);
        break;
      case "email": {
        const v = asString(p.value);
        if (v) (out.email ??= []).push(v);
        break;
      }
      case "tel": {
        const v = textValue(p);
        if (!v) break;
        // TYPE may be a string or an array (e.g. "fax", ["work", "fax"])
        (paramList(p.params.type).includes("fax") ? (out.fax ??= []) : (out.tel ??= [])).push(v);
        break;
      }
      case "url":
        out.url ??= asString(p.value);
        break;
      case "adr": {
        if (!Array.isArray(p.value) || out.country !== undefined || out.locality !== undefined) {
          break;
        }
        // [postOfficeBox, extendedAddress, street, locality, region, postalCode, country]
        out.poBox = part(p.value, 0);
        const street = [...lines(part(p.value, 1)), ...lines(part(p.value, 2))];
        out.street = street.length ? street : undefined;
        out.locality = part(p.value, 3);
        out.region = part(p.value, 4);
        out.postcode = part(p.value, 5);
        out.country = part(p.value, 6);
        // RFC 8605: ISO 3166-1 alpha-2 code lives in the "cc" parameter
        const cc = asString(p.params.cc);
        if (cc) out.countryCode = cc.toUpperCase();
        break;
      }
    }
  }
  return out;
}
