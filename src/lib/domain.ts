import psl from "psl";

export function extractTld(domain: string): string {
  const lower = domain.trim().toLowerCase();
  try {
    const parsed = psl.parse?.(lower) as { tld?: string };
    const suffix = parsed?.tld;
    if (suffix) {
      const labels = String(suffix).split(".").filter(Boolean);
      if (labels.length) return labels[labels.length - 1];
    }
  } catch {
    // ignore and fall back
  }
  const parts = lower.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? lower;
}

export function getDomainParts(domain: string): {
  publicSuffix: string;
  tld: string;
} {
  const lower = domain.toLowerCase().trim();
  let publicSuffix: string | undefined;
  try {
    const parsed = psl.parse?.(lower) as { tld?: string };
    publicSuffix = parsed?.tld;
  } catch {
    // ignore
  }
  if (!publicSuffix) {
    const parts = lower.split(".").filter(Boolean);
    publicSuffix = parts.length ? parts[parts.length - 1] : lower;
  }
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
