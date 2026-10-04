import { parse } from "tldts";
import { getSubRegistrySuffix } from "./subregistries";

type ParseOptions = Parameters<typeof parse>[1];

/**
 * Parse a domain into its parts. Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainParts(domain: string, opts?: ParseOptions): ReturnType<typeof parse> {
  return parse(domain, { ...opts });
}

/**
 * Get the TLD of a domain: the ICANN public suffix, or for a name under a sub-registry the suffix
 * it is registered under ("uk.com" for google.uk.com), matching the `tld` a lookup reports.
 * Passes options to `tldts.parse()`.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function getDomainTld(domain: string, opts?: ParseOptions): string | null {
  const result = getDomainParts(domain, {
    allowPrivateDomains: false,
    ...opts,
  });
  const sub = result.hostname && !result.isIp ? getSubRegistrySuffix(result.hostname) : undefined;
  return sub ?? result.publicSuffix ?? null;
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
 * Normalize arbitrary input (domain or URL) to its registrable domain (eTLD+1), the name a
 * `lookup()` accepts. A name under a sub-registry keeps its own label ("google.uk.com", not
 * "uk.com"). Passes options to `tldts.parse()`.
 * Returns null when the input is not a valid ICANN domain (e.g., invalid TLD, IPs), or with
 * `allowPrivateDomains`, a valid ICANN or private one.
 * @see https://github.com/remusao/tldts/blob/master/packages/tldts-core/src/options.ts
 */
export function toRegistrableDomain(input: string, opts?: ParseOptions): string | null {
  const raw = (input ?? "").trim();
  if (raw === "") return null;

  const result = getDomainParts(raw, {
    allowPrivateDomains: false,
    ...opts,
  });

  // Reject IPs and suffixes outside the ICANN section, unless private ones were asked for
  if (result.isIp) return null;
  if (!result.isIcann && !(opts?.allowPrivateDomains && result.isPrivate)) return null;

  // Names under a sub-registry (google.uk.com) are registered with its operator, one label below
  // the suffix; the Public Suffix List's ICANN section stops at "uk.com"
  const host = result.hostname?.toLowerCase().replace(/\.$/, "");
  const sub = host ? getSubRegistrySuffix(host) : undefined;
  if (host && sub) {
    return host
      .split(".")
      .slice(-(sub.split(".").length + 1))
      .join(".");
  }

  const domain = result.domain ?? "";
  if (domain === "") return null;
  return domain.toLowerCase();
}
