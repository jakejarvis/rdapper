import { parse } from "tldts";

type ParseOptions = Parameters<typeof parse>[1];

/**
 * Parse a domain into its parts. Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainParts(
  domain: string,
  opts?: ParseOptions,
): ReturnType<typeof parse> {
  return parse(domain, { ...opts });
}

/**
 * Get the TLD (ICANN-only public suffix) of a domain. Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
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
 * Passes options to `tldts.parse()`.
 * Returns null when the input is not a valid ICANN domain (e.g., invalid TLD, IPs)
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
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
