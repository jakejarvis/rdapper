import { resolveTimeoutMs, throwIfAborted, withTimeout } from "../lib/async";
import { DEFAULT_BOOTSTRAP_URL } from "../lib/constants";
import { RdapperError } from "../lib/errors";
import { resolveFetch } from "../lib/fetch";
import { SUB_REGISTRIES } from "../lib/subregistries";
import { type LookupContext, traced } from "../lib/trace";
import type { BootstrapData, LookupOptions } from "../types";

/**
 * Load RDAP bootstrap data, or `undefined` when it could not be fetched (the failure is
 * recorded in `ctx.attempts` and the caller falls back to WHOIS).
 *
 * Bootstrap data is resolved in the following priority order:
 * 1. `options.customBootstrapData` - pre-loaded bootstrap data (no fetch), unless undefined/null
 * 2. `options.customBootstrapUrl` - custom URL to fetch bootstrap data from
 * 3. Default IANA URL - https://data.iana.org/rdap/dns.json
 */
async function loadBootstrapData(
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<BootstrapData | undefined> {
  let data: BootstrapData;

  // Priority 1: Use pre-loaded bootstrap data if provided (no fetch). `undefined`/`null` count as
  // not provided, so a caller whose own fetch failed can pass its result straight through.
  const provided = options?.customBootstrapData;
  if (provided != null) {
    // A wrong shape is the caller's bug, not a missing server: fail as invalid_input instead of
    // quietly falling back. Malformed service entries are only skipped (see matchBases).
    if (typeof provided !== "object") {
      throw new RdapperError(
        "invalid_input",
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
    }
    if (!Array.isArray(provided.services)) {
      throw new RdapperError(
        "invalid_input",
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
    }
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
    } catch {
      // Preserve caller cancellation behavior - rethrow if explicitly aborted (or deadline hit)
      if (options?.signal?.aborted) throwIfAborted(options.signal);
      // Network, timeout, or JSON parse errors - return empty array to fall back to WHOIS
      // (the failure is recorded in ctx.attempts). An AbortError the caller didn't cause (a
      // customFetch's own timeout) is one of these.
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
    // Skip an entry that isn't a [string[], string[]] tuple rather than failing the lookup
    if (!Array.isArray(svc) || !Array.isArray(svc[0]) || !Array.isArray(svc[1])) continue;
    const tlds = svc[0].filter((x) => typeof x === "string").map((x) => x.toLowerCase());
    const urls = svc[1].filter((u) => typeof u === "string");
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
 * Sub-registry suffixes (`uk.com`) are answered from {@link SUB_REGISTRIES} without loading the
 * bootstrap, with none for an operator that publishes no RDAP (`ac.uk`). Otherwise IANA lists
 * registry TLDs (`uk`, `br`), not public suffixes (`co.uk`, `com.br`), so the suffix usually
 * misses and the last label is tried next. The bootstrap data is loaded once and reused for both
 * lookups.
 */
export async function getRdapBaseUrlsForPublicSuffix(
  publicSuffix: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<string[]> {
  const subRegistry = SUB_REGISTRIES[publicSuffix.toLowerCase()];
  if (subRegistry) return subRegistry.rdap ? [subRegistry.rdap] : [];
  const data = await loadBootstrapData(options, ctx);
  if (!data) return [];
  const bases = matchBases(data, publicSuffix);
  if (bases.length > 0 || !publicSuffix.includes(".")) return bases;
  return matchBases(data, publicSuffix.split(".").pop() ?? publicSuffix);
}
