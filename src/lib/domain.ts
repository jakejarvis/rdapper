import { parse } from "tldts";

type ParseOptions = Parameters<typeof parse>[1];

/**
 * Parse a domain into its parts. Accepts options which are passed to tldts.parse().
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainParts(
  domain: string,
  opts?: ParseOptions,
): ReturnType<typeof parse> {
  return parse(domain, { ...opts });
}

/** Get the TLD (ICANN-only public suffix) of a domain. */
export function getDomainTld(
  domain: string,
  opts?: ParseOptions,
): string | null {
  const result = getDomainParts(domain, {
    allowPrivateDomains: false,
    ...opts,
  });
  return result.publicSuffix ?? null;
}

/**
 * Basic domain validity check (hostname-like), not performing DNS or RDAP.
 */
export function isLikelyDomain(value: string): boolean {
  const v = (value ?? "").trim();
  // Accept punycoded labels (xn--) by allowing digits and hyphens in TLD as well,
  // while disallowing leading/trailing hyphens in any label.
  return /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?!-)[a-z0-9-]{2,63}(?<!-)$/.test(
    v.toLowerCase(),
  );
}

export function punyToUnicode(domain: string): string {
  try {
    return domain.normalize("NFC");
  } catch {
    return domain;
  }
}

/**
 * Normalize arbitrary input (domain or URL) to its registrable domain (eTLD+1).
 * Returns null when the input is not a valid ICANN domain (e.g., invalid TLD, IPs).
 */
export function toRegistrableDomain(
  input: string,
  opts?: ParseOptions,
): string | null {
  const raw = (input ?? "").trim();
  if (raw === "") return null;

  const result = getDomainParts(raw, {
    allowPrivateDomains: false,
    ...opts,
  });

  // Reject IPs and non-ICANN/public suffixes.
  if (result.isIp) return null;
  if (!result.isIcann) return null;

  const domain = result.domain ?? "";
  if (domain === "") return null;
  return domain.toLowerCase();
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
