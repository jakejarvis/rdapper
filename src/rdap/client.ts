import { withTimeout } from "../lib/async";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants";
import { resolveFetch } from "../lib/fetch";
import type { LookupOptions } from "../types";

/**
 * Fetch RDAP JSON for a domain from a specific RDAP base URL.
 * Throws on HTTP >= 400 (includes RDAP error JSON payloads).
 */
export async function fetchRdapDomain(
  domain: string,
  baseUrl: string,
  options?: LookupOptions,
): Promise<{ url: string; json: unknown }> {
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
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`RDAP ${res.status}: ${bodyText.slice(0, 500)}`);
  }
  const json = await res.json();
  return { url, json };
}
