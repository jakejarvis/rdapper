import type { Contact } from "../types";
import { resolveCountry } from "./countries";
import { isPlaceholderValue, isPrivacyName } from "./privacy";

function cleanValue(value: string | string[] | undefined): {
  value: string | string[] | undefined;
  dropped: boolean;
} {
  if (value === undefined) return { value, dropped: false };
  const list = Array.isArray(value) ? value : [value];
  const kept = list.filter((v) => !isPlaceholderValue(v));
  const dropped = kept.length !== list.length;
  if (!kept.length) return { value: undefined, dropped };
  return { value: Array.isArray(value) && kept.length > 1 ? kept : kept[0], dropped };
}

/**
 * Post-process a parsed contact: drop placeholder email/phone/fax values, resolve
 * country/countryCode, and set `redacted` when any redaction signal is present.
 * `redactedHint` lets callers pass format-specific signals (e.g. RFC 9537 entries).
 */
export function finalizeContact(contact: Contact, redactedHint = false): Contact {
  let redacted = redactedHint;
  for (const key of ["email", "phone", "fax"] as const) {
    const { value, dropped } = cleanValue(contact[key]);
    contact[key] = value;
    if (dropped) redacted = true;
  }
  if ([contact.name, contact.organization].some((v) => v && isPrivacyName(v))) redacted = true;
  const { country, countryCode } = resolveCountry(contact.country, contact.countryCode);
  contact.country = country;
  contact.countryCode = countryCode;
  if (redacted) contact.redacted = true;
  return contact;
}
