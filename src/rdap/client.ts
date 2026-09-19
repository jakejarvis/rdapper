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

/** Parse a `Retry-After` header (delay-seconds or HTTP date) into milliseconds. */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
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
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const retryAfterMs = parseRetryAfterMs(retryAfter);
          throw new RdapperError(
            "rate_limited",
            `RDAP 429 rate limited${retryAfter ? ` (Retry-After: ${retryAfter})` : ""}`,
            retryAfterMs !== undefined ? { retryAfterMs } : undefined,
          );
        }
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          const retryAfterMs =
            res.status === 503 ? parseRetryAfterMs(res.headers.get("retry-after")) : undefined;
          throw new RdapperError(
            "http_error",
            `RDAP ${res.status}: ${bodyText.slice(0, 500)}`,
            retryAfterMs !== undefined ? { retryAfterMs } : undefined,
          );
        }
        const json = await res.json();
        return { url, json };
      },
    ),
  );
}
