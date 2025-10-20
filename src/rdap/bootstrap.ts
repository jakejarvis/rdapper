import { withTimeout } from "../lib/async";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants";
import type { LookupOptions } from "../types";

// Use global fetch (Node 18+). For large JSON we keep it simple.

// RDAP bootstrap JSON format as published by IANA
interface BootstrapData {
  version: string;
  publication: string;
  description?: string;
  // Each service entry is [[tld1, tld2, ...], [baseUrl1, baseUrl2, ...]]
  services: string[][][];
}

/**
 * Resolve RDAP base URLs for a given TLD using IANA's bootstrap registry.
 * Returns zero or more base URLs (always suffixed with a trailing slash).
 */
export async function getRdapBaseUrlsForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string[]> {
  const bootstrapUrl =
    options?.customBootstrapUrl ?? "https://data.iana.org/rdap/dns.json";
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
  const data = (await res.json()) as BootstrapData;
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
