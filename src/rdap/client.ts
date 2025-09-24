import { withTimeout } from "../lib/async.js";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants.js";
import type { LookupOptions } from "../types.js";

// Use global fetch (Node 18+). For large JSON we keep it simple.

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
  const res = await withTimeout(
    fetch(url, {
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
