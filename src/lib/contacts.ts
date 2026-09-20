import type { Contact, ContactField } from "../types";
import { resolveCountry } from "./countries";
import { isPlaceholderValue, isPrivacyName } from "./privacy";

function cleanValue(
  value: string | string[] | undefined,
  keepArray = false,
): {
  value: string | string[] | undefined;
  dropped: boolean;
} {
  if (value === undefined) return { value, dropped: false };
  const list = Array.isArray(value) ? value : [value];
  const kept = list.filter((v) => !isPlaceholderValue(v));
  const dropped = kept.length !== list.length;
  if (!kept.length) return { value: undefined, dropped };
  const asArray = Array.isArray(value) && (keepArray || kept.length > 1);
  return { value: asArray ? kept : kept[0], dropped };
}

// Contact fields cleaned of placeholder text, and reported in `redactedFields` when dropped.
const CLEANED_FIELDS = [
  "name",
  "organization",
  "email",
  "phone",
  "fax",
  "street",
  "city",
  "state",
  "postalCode",
  "poBox",
] as const satisfies readonly ContactField[];

// Secondary fields: cleaned the same way but not reported (no `ContactField` for them).
const CLEANED_EXTRA = ["organizationUnits", "title", "role"] as const;

/** Map an RFC 9537 redaction name/path (e.g. "Registrant Email") to the contact fields it covers. */
export function redactionFields(text: string): ContactField[] {
  const t = text.toLowerCase();
  const out: ContactField[] = [];
  if (/\bname\b|\bfn\b/.test(t) && !/\borg/.test(t)) out.push("name");
  if (/\borg/.test(t)) out.push("organization");
  if (/e-?mail/.test(t)) out.push("email");
  if (/phone|\btel\b/.test(t) && !/fax/.test(t)) out.push("phone");
  if (/\bfax\b/.test(t)) out.push("fax");
  if (/street|address/.test(t)) out.push("street");
  if (/city|locality/.test(t)) out.push("city");
  if (/state|province|region/.test(t)) out.push("state");
  if (/postal|post code|postcode|zip/.test(t)) out.push("postalCode");
  if (/\bpo box\b|\bpobox\b/.test(t)) out.push("poBox");
  return out;
}

/**
 * Post-process a parsed contact: drop placeholder values from every field (recording each in
 * `redactedFields`), flag privacy-service names (`privacyService`), resolve country/countryCode,
 * and set `redacted` when any redaction signal is present.
 *
 * `redactedHint` lets callers pass format-specific signals (e.g. RFC 9537 entries): `true` when
 * something was redacted but the fields are unknown, or the list of fields known to be redacted.
 */
export function finalizeContact(
  contact: Contact,
  redactedHint: boolean | ContactField[] = false,
): Contact {
  const redactedFields = new Set<ContactField>();
  let redacted = redactedHint === true || (Array.isArray(redactedHint) && redactedHint.length > 0);
  if (Array.isArray(redactedHint)) for (const f of redactedHint) redactedFields.add(f);

  const record = contact as unknown as Record<string, string | string[] | undefined>;
  for (const key of CLEANED_FIELDS) {
    const { value, dropped } = cleanValue(record[key], key === "street");
    record[key] = value;
    if (dropped) redactedFields.add(key);
  }
  for (const key of CLEANED_EXTRA) {
    const { value, dropped } = cleanValue(record[key]);
    record[key] = value;
    if (dropped) redacted = true;
  }

  // Remaining name/organization text that names a privacy service is kept, since it is useful to show.
  if ([contact.name, contact.organization].some((v) => v && isPrivacyName(v))) {
    contact.privacyService = true;
    redacted = true;
  }

  const { country, countryCode } = resolveCountry(contact.country, contact.countryCode);
  contact.country = country;
  contact.countryCode = countryCode;

  if (redactedFields.size) {
    contact.redactedFields = CLEANED_FIELDS.filter((f) => redactedFields.has(f));
    redacted = true;
  }
  if (redacted) contact.redacted = true;
  return contact;
}

/** True when a registrant contact's name/organization is a privacy service or was redacted. */
export function isPrivacyContact(contact: Contact | undefined): boolean {
  return (
    !!contact?.privacyService ||
    !!contact?.redactedFields?.some((f) => f === "name" || f === "organization")
  );
}
