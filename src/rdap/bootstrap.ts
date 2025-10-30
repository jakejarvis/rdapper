import { withTimeout } from "../lib/async";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants";
import type { BootstrapData, LookupOptions } from "../types";

const DEFAULT_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json" as const;

/**
 * Resolve RDAP base URLs for a given TLD using IANA's bootstrap registry.
 * Returns zero or more base URLs (always suffixed with a trailing slash).
 *
 * Bootstrap data is resolved in the following priority order:
 * 1. `options.customBootstrapData` - pre-loaded bootstrap data (no fetch)
 * 2. `options.customBootstrapUrl` - custom URL to fetch bootstrap data from
 * 3. Default IANA URL - https://data.iana.org/rdap/dns.json
 *
 * @param tld - The top-level domain to look up (e.g., "com", "co.uk")
 * @param options - Optional lookup options including custom bootstrap data/URL
 * @returns Array of RDAP base URLs for the TLD, or empty array if none found
 */
export async function getRdapBaseUrlsForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string[]> {
  let data: BootstrapData;

  // Priority 1: Use pre-loaded bootstrap data if provided (no fetch)
  if (options && "customBootstrapData" in options) {
    data = options.customBootstrapData as BootstrapData;
    // Validate the structure to provide helpful error messages
    if (!data || typeof data !== "object") {
      throw new Error(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
    }
    if (!Array.isArray(data.services)) {
      throw new Error(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
    }
  } else {
    // Priority 2 & 3: Fetch from custom URL or default IANA URL
    const bootstrapUrl =
      options?.customBootstrapUrl ?? DEFAULT_BOOTSTRAP_URL;
    const res = await withTimeout(
      fetch(bootstrapUrl, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: options?.signal,
      }),
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "RDAP bootstrap timeout",
    );
    if (!res.ok) return [];
    data = (await res.json()) as BootstrapData;
  }

  // Parse the bootstrap data to find matching base URLs for the TLD
  const target = tld.toLowerCase();
  const bases: string[] = [];
  for (const svc of data.services) {
    const tlds = svc[0].map((x) => x.toLowerCase());
    const urls = svc[1];
    // Match exact TLD, and also support multi-label public suffixes present in IANA (rare)
    if (tlds.includes(target)) {
      for (const u of urls) {
        const base = u.endsWith("/") ? u : `${u}/`;
        bases.push(base);
      }
    }
  }
  return Array.from(new Set(bases));
}
