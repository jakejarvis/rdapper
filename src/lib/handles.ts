/**
 * A single token with a digit, or an uppercase hyphenated code: a registry handle. Broad, so only
 * for fields that usually hold a handle (WHOIS's bare "registrant:" key, an RDAP entity handle).
 */
export function looksLikeHandle(value: string): boolean {
  const v = value.trim();
  return !/\s/.test(v) && (/\d/.test(v) || /^[A-Z]+(?:-[A-Z]+)+$/.test(v));
}

// NIC handles: "JJ1234-IS", "NG8867695-NICAT", "C123-LRMS"; a registry-suffixed code such as
// "ABC123-RIPE" or "AB1-NORID"; or letters and a long number, "G31071", "C12345678". Codes without
// a digit only count with a known registry suffix, so all-caps names like "ACME-CORP" survive.
const NIC_HANDLE =
  /^(?:[A-Z]{1,6}\d{1,10}-[A-Z]{2,8}|[A-Z0-9]{2,10}-(?:IS|RIPE|APNIC|AP|ARIN|NORID|SE|NL|DK|FI)|[A-Z]{1,3}\d{5,})$/;

/**
 * Whether a value is a registry handle rather than a name. Strict, for fields that usually hold a
 * name (a contact's name or organization), where "3M" or "ACME-CORP" must survive.
 */
export function isRegistryHandle(value: string): boolean {
  return NIC_HANDLE.test(value.trim());
}
