import { withTimeout } from "../lib/async";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants";
import { resolveFetch } from "../lib/fetch";
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
): Promise<RdapFetchResult> {
  const url = new URL(
    `domain/${encodeURIComponent(domain)}`,
    baseUrl,
  ).toString();
  const fetchFn = resolveFetch(options);
  const res = await withTimeout(
    fetchFn(url, {
      method: "GET",
      headers: { accept: "application/rdap+json, application/json" },
      signal: options?.signal,
    }),
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "RDAP lookup timeout",
  );
  // HTTP 404 = domain not found (not registered)
  // Per RFC 9083, RDAP servers return 404 for objects that don't exist
  if (res.status === 404) {
    return { url, json: null, notFound: true };
  }
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`RDAP ${res.status}: ${bodyText.slice(0, 500)}`);
  }
  const json = await res.json();
  return { url, json };
}
