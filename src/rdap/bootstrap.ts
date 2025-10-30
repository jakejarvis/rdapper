import { withTimeout } from "../lib/async";
import { DEFAULT_BOOTSTRAP_URL, DEFAULT_TIMEOUT_MS } from "../lib/constants";
import { resolveFetch } from "../lib/fetch";
import type { BootstrapData, LookupOptions } from "../types";

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
    const provided = options.customBootstrapData;
    // Validate the structure to provide helpful error messages
    if (!provided || typeof provided !== "object") {
      throw new Error(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
    }
    if (!Array.isArray(provided.services)) {
      throw new Error(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
    }
    provided.services.forEach((svc, idx) => {
      if (
        !Array.isArray(svc) ||
        svc.length < 2 ||
        !Array.isArray(svc[0]) ||
        !Array.isArray(svc[1])
      ) {
        throw new Error(
          `Invalid customBootstrapData: services[${idx}] must be a tuple of [string[], string[]].`,
        );
      }
    });
    data = provided;
  } else {
    // Priority 2 & 3: Fetch from custom URL or default IANA URL
    // Use custom fetch implementation if provided for caching/logging/monitoring
    const fetchFn = resolveFetch(options);
    const bootstrapUrl = options?.customBootstrapUrl ?? DEFAULT_BOOTSTRAP_URL;
    try {
      const res = await withTimeout(
        fetchFn(bootstrapUrl, {
          method: "GET",
          headers: { accept: "application/json" },
          signal: options?.signal,
        }),
        options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        "RDAP bootstrap timeout",
      );
      if (!res.ok) return [];
      data = (await res.json()) as BootstrapData;
    } catch (err: unknown) {
      // Preserve caller cancellation behavior - rethrow if explicitly aborted
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      // Network, timeout, or JSON parse errors - return empty array to fall back to WHOIS
      return [];
    }
  }

  // Parse the bootstrap data to find matching base URLs for the TLD
  const target = tld.toLowerCase();
  const bases: string[] = [];
  for (const svc of data.services) {
    if (!svc[0] || !svc[1]) continue;
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
