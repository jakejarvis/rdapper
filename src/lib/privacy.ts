export const PRIVACY_NAME_KEYWORDS = [
  "redacted",
  "privacy",
  "private",
  "withheld",
  "not disclosed",
  "protected",
  "protection",
  "privado", // Spanish
  "datos privados", // Spanish
  "data protected",
  "data redacted",
  "gdpr redacted",
  "gdpr masked",
  "non-public data",
  "statutory masking",
  "redacted.forprivacy",
  "registration private",
  "hidden upon user request",
  "not available from registry",
];

// Completely unusable/empty values that should be filtered
export const NO_DATA_VALUES = [
  "-",
  ".",
  "n/a",
  "na",
  "no data",
  "not available",
  "not applicable",
  "none",
];

export function isPrivacyName(value: string): boolean {
  const v = value.toLowerCase().trim();
  // Check for complete no-data values
  if (NO_DATA_VALUES.includes(v)) return true;
  // Check for privacy keywords
  return PRIVACY_NAME_KEYWORDS.some((k) => v.includes(k));
}
