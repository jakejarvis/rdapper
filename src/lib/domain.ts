import { getPublicSuffix } from "tldts";

export function getDomainParts(domain: string): {
  publicSuffix: string;
  tld: string;
} {
  const lower = domain.toLowerCase().trim();
  const suffix = getPublicSuffix(lower) || "";
  const publicSuffix =
    suffix || lower.split(".").filter(Boolean).pop() || lower;
  const labels = publicSuffix.split(".").filter(Boolean);
  const tld = labels.length ? labels[labels.length - 1] : publicSuffix;
  return { publicSuffix, tld };
}

export function isLikelyDomain(input: string): boolean {
  return /^[a-z0-9.-]+$/i.test(input) && input.includes(".");
}

export function punyToUnicode(domain: string): string {
  try {
    return domain.normalize("NFC");
  } catch {
    return domain;
  }
}

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
];

export function isWhoisAvailable(text: string | undefined): boolean {
  if (!text) return false;
  return WHOIS_AVAILABLE_PATTERNS.some((re) => re.test(text));
}
