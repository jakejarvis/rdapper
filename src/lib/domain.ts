import { parse } from "tldts";

type ParseOptions = Parameters<typeof parse>[1];

/**
 * Parse a domain into its parts. Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainParts(domain: string, opts?: ParseOptions): ReturnType<typeof parse> {
  return parse(domain, { ...opts });
}

/**
 * Get the TLD (ICANN-only public suffix) of a domain. Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainTld(domain: string, opts?: ParseOptions): string | null {
  const result = getDomainParts(domain, {
    allowPrivateDomains: false,
    ...opts,
  });
  return result.publicSuffix ?? null;
}

/**
 * The lowercase ASCII (punycode) form of a domain name, accepting Unicode labels, surrounding
 * whitespace, and a trailing dot. Undefined when the input is not a bare hostname.
 */
export function toAsciiDomain(input: string): string | undefined {
  const raw = (input ?? "").trim().replace(/\.$/, "");
  // The URL parser would also accept a path, port, or credentials
  if (!raw || /[\s/\\?#@:%]/.test(raw)) return undefined;
  try {
    return new URL(`http://${raw}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Basic domain validity check (hostname-like), not performing DNS or RDAP. Unicode names are
 * checked in their punycode form.
 */
export function isLikelyDomain(value: string): boolean {
  const v = toAsciiDomain(value);
  // Accept punycoded labels (xn--) by allowing digits and hyphens in TLD as well,
  // while disallowing leading/trailing hyphens in any label and an all-numeric TLD (an IP).
  return (
    !!v &&
    /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?!-)(?!\d+$)[a-z0-9-]{2,63}(?<!-)$/.test(v)
  );
}

/**
 * Normalize arbitrary input (domain or URL) to its registrable domain (eTLD+1).
 * Passes options to `tldts.parse()`.
 * Returns null when the input is not a valid ICANN domain (e.g., invalid TLD, IPs)
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function toRegistrableDomain(input: string, opts?: ParseOptions): string | null {
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
