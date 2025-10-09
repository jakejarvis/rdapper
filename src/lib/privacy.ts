export const PRIVACY_NAME_KEYWORDS = [
  "redacted",
  "privacy",
  "private",
  "withheld",
  "not disclosed",
  "protected",
  "protection",
];

export function isPrivacyName(value: string): boolean {
  const v = value.toLowerCase();
  return PRIVACY_NAME_KEYWORDS.some((k) => v.includes(k));
}
