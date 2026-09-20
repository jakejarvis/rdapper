/**
 * Redaction notices: text that stands in for a withheld value. Shared by `isPrivacyName` (as
 * substrings) and `isPlaceholderValue` (as whole words), so the two can't drift apart.
 */
const REDACTION_PHRASES = [
  "redacted", // also covers "redacted for privacy", "redacted.forprivacy"
  "withheld",
  "not disclosed",
  "data protected",
  "gdpr masked",
  "statutory masking",
  "non-public data",
  "hidden upon user request",
  "not available from registry",
];

/**
 * Privacy/proxy service names and other phrases that indicate privacy on their own. Unlike
 * redaction notices these can be real registrant text worth showing, so they aren't placeholders.
 */
const PRIVACY_SERVICE_PHRASES = [
  "privado", // Spanish
  "datos privados", // Spanish
  "registration private",
  "private registration",
  "whois privacy",
  "whoisguard",
  "privacy protect",
  "privacy service",
  "domain privacy",
  "contact privacy",
  "domains by proxy",
  "proxy service",
  "for privacy",
];

/**
 * Phrases that indicate privacy/redaction on their own. Matched as case-insensitive substrings.
 */
export const PRIVACY_STRONG_KEYWORDS = [...REDACTION_PHRASES, ...PRIVACY_SERVICE_PHRASES];

/**
 * Words too ambiguous to trust alone ("Private Equity LLC", "Protection One"). They only count
 * when at least two distinct terms from WEAK + CONTEXT appear as whole words.
 */
const PRIVACY_WEAK_WORDS = ["privacy", "private", "protect", "protected", "protection"];
const PRIVACY_CONTEXT_WORDS = [
  "whois",
  "proxy",
  "domain",
  "domains",
  "registration",
  "guard",
  "service",
  "services",
  "masked",
  "anonymous",
  "identity",
  "contact",
];
const WEAK_WORD_RE = new RegExp(`\\b(?:${PRIVACY_WEAK_WORDS.join("|")})\\b`, "g");
const CONTEXT_WORD_RE = new RegExp(
  `\\b(?:${[...PRIVACY_WEAK_WORDS, ...PRIVACY_CONTEXT_WORDS].join("|")})\\b`,
  "g",
);

/** True when a registrant name/organization looks like a privacy service or redaction notice. */
export function isPrivacyName(value: string): boolean {
  const v = value.toLowerCase().trim();
  if (PRIVACY_STRONG_KEYWORDS.some((k) => v.includes(k))) return true;
  if (!WEAK_WORD_RE.test(v)) return false;
  WEAK_WORD_RE.lastIndex = 0;
  return new Set(v.match(CONTEXT_WORD_RE)).size >= 2;
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Boilerplate that registrars put in email/phone/etc. instead of real values
const PLACEHOLDER_VALUE_PATTERNS = [
  ...REDACTION_PHRASES.map((p) => new RegExp(`\\b${escapeRe(p)}\\b`, "i")),
  /please query the rdds/i,
  /please query the rdap/i,
  /query the whois/i,
  /\bcontact (?:the )?registrar\b/i,
  /\bnot applicable\b/i,
  /select request email form/i,
  /^(?:-+|n\/a|na|none|null|undefined|unknown)$/i,
];

/** True when a contact field value (email, phone, ...) is a placeholder rather than real data. */
export function isPlaceholderValue(value: string): boolean {
  const v = value.trim();
  return !v || PLACEHOLDER_VALUE_PATTERNS.some((re) => re.test(v));
}
