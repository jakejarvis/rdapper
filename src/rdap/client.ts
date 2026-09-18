import { resolveTimeoutMs, withTimeout } from "../lib/async";
import { RdapperError } from "../lib/errors";
import { resolveFetch } from "../lib/fetch";
import { type LookupContext, traced } from "../lib/trace";
import type { LookupOptions } from "../types";

/**
 * Result of an RDAP fetch operation.
 * - `json` contains the RDAP response if successful
 * - `notFound` is true if the server returned 404 (domain not registered)
 */
export interface RdapFetchResult {
  url: string;
  json: unknown;
  notFound?: boolean;
}

/**
 * Fetch RDAP JSON for a domain from a specific RDAP base URL.
 * Returns `{ notFound: true }` for HTTP 404 (domain not registered).
 * Throws on other HTTP errors (5xx, network errors, etc.).
 */
export async function fetchRdapDomain(
  domain: string,
  baseUrl: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<RdapFetchResult> {
  const url = new URL(`domain/${encodeURIComponent(domain)}`, baseUrl).toString();
  const fetchFn = resolveFetch(options);
  return traced(ctx, { phase: "rdap", server: baseUrl }, () =>
    withTimeout(
      resolveTimeoutMs(options),
      "RDAP lookup timeout",
      options?.signal,
      async (signal) => {
        const res = await fetchFn(url, {
          method: "GET",
          headers: { accept: "application/rdap+json, application/json" },
          signal,
        });
        // HTTP 404 = domain not found (not registered)
        // Per RFC 9083, RDAP servers return 404 for objects that don't exist
        if (res.status === 404) {
          return { url, json: null, notFound: true };
        }
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          throw new RdapperError("http_error", `RDAP ${res.status}: ${bodyText.slice(0, 500)}`);
        }
        const json = await res.json();
        return { url, json };
      },
    ),
  );
}
