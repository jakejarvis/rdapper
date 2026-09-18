import { resolveTimeoutMs, throwIfAborted, withTimeout } from "../lib/async";
import { DEFAULT_BOOTSTRAP_URL } from "../lib/constants";
import { RdapperError } from "../lib/errors";
import { resolveFetch } from "../lib/fetch";
import { type LookupContext, traced } from "../lib/trace";
import type { BootstrapData, LookupOptions } from "../types";

/**
 * Load RDAP bootstrap data, or `undefined` when it could not be fetched (the failure is
 * recorded in `ctx.attempts` and the caller falls back to WHOIS).
 *
 * Bootstrap data is resolved in the following priority order:
 * 1. `options.customBootstrapData` - pre-loaded bootstrap data (no fetch)
 * 2. `options.customBootstrapUrl` - custom URL to fetch bootstrap data from
 * 3. Default IANA URL - https://data.iana.org/rdap/dns.json
 */
async function loadBootstrapData(
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<BootstrapData | undefined> {
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
      data = await traced(ctx, { phase: "rdap_bootstrap", server: bootstrapUrl }, () =>
        withTimeout(
          resolveTimeoutMs(options),
          "RDAP bootstrap timeout",
          options?.signal,
          async (signal) => {
            const res = await fetchFn(bootstrapUrl, {
              method: "GET",
              headers: { accept: "application/json" },
              signal,
            });
            if (!res.ok) {
              throw new RdapperError("http_error", `RDAP bootstrap ${res.status}`);
            }
            const json = (await res.json()) as BootstrapData;
            if (!json || !Array.isArray(json.services)) {
              throw new RdapperError("no_data", "RDAP bootstrap has no services array");
            }
            return json;
          },
        ),
      );
    } catch (err: unknown) {
      // Preserve caller cancellation behavior - rethrow if explicitly aborted (or deadline hit)
      if (options?.signal?.aborted) throwIfAborted(options.signal);
      if (err instanceof Error && err.name === "AbortError") throw err;
      // Network, timeout, or JSON parse errors - return empty array to fall back to WHOIS
      // (the failure is recorded in ctx.attempts)
      return undefined;
    }
  }
  return data;
}

/** Find the RDAP base URLs listed for `tld` (always suffixed with a trailing slash). */
function matchBases(data: BootstrapData, tld: string): string[] {
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

/**
 * Resolve RDAP base URLs for a given TLD using IANA's bootstrap registry.
 * Returns zero or more base URLs (always suffixed with a trailing slash).
 * See {@link loadBootstrapData} for how the bootstrap data is sourced.
 *
 * @param tld - The top-level domain to look up (e.g., "com", "co.uk")
 * @param options - Optional lookup options including custom bootstrap data/URL
 * @param ctx - Optional context that records the bootstrap fetch as an attempt
 * @returns Array of RDAP base URLs for the TLD, or empty array if none found
 */
export async function getRdapBaseUrlsForTld(
  tld: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<string[]> {
  const data = await loadBootstrapData(options, ctx);
  return data ? matchBases(data, tld) : [];
}

/**
 * Like {@link getRdapBaseUrlsForTld}, for a public suffix that may be multi-label.
 *
 * IANA lists registry TLDs (`uk`, `br`), not public suffixes (`co.uk`, `com.br`), so the
 * suffix usually misses and the last label is tried next. The bootstrap data is loaded
 * once and reused for both lookups.
 */
export async function getRdapBaseUrlsForPublicSuffix(
  publicSuffix: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<string[]> {
  const data = await loadBootstrapData(options, ctx);
  if (!data) return [];
  const bases = matchBases(data, publicSuffix);
  if (bases.length > 0 || !publicSuffix.includes(".")) return bases;
  return matchBases(data, publicSuffix.split(".").pop() ?? publicSuffix);
}
