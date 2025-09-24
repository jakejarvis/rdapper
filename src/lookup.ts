import { normalizeRdap } from "./normalize-rdap.js";
import { normalizeWhois } from "./normalize-whois.js";
import { fetchRdapDomain, getRdapBaseUrlsForTld } from "./rdap.js";
import type { DomainRecord, LookupOptions, LookupResult } from "./types.js";
import { extractTld, isLikelyDomain, toISO } from "./utils.js";
import {
  extractWhoisReferral,
  ianaWhoisServerForTld,
  whoisQuery,
} from "./whois.js";

/**
 * High-level lookup that prefers RDAP and falls back to WHOIS.
 * Ensures a standardized DomainRecord, independent of the source.
 */
export async function lookupDomain(
  domain: string,
  opts?: LookupOptions,
): Promise<LookupResult> {
  try {
    if (!isLikelyDomain(domain)) {
      return { ok: false, error: "Input does not look like a domain" };
    }
    const tld = extractTld(domain);
    // Avoid non-null assertion: fallback to a stable ISO string if parsing ever fails
    const now =
      toISO(new Date()) ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    // If WHOIS-only, skip RDAP path
    if (!opts?.whoisOnly) {
      const bases = await getRdapBaseUrlsForTld(tld, opts);
      const tried: string[] = [];
      for (const base of bases) {
        tried.push(base);
        try {
          const { json } = await fetchRdapDomain(domain, base, opts);
          const record: DomainRecord = normalizeRdap(
            domain,
            tld,
            json,
            tried,
            now,
          );
          return { ok: true, record };
        } catch {
          // try next base
        }
      }
      // Some TLDs are not in bootstrap yet; continue to WHOIS fallback unless rdapOnly
      if (opts?.rdapOnly) {
        return {
          ok: false,
          error: "RDAP not available or failed for this TLD",
        };
      }
    }

    // WHOIS fallback path
    const whoisServer = await ianaWhoisServerForTld(tld, opts);
    if (!whoisServer) {
      return { ok: false, error: "No WHOIS server discovered for TLD" };
    }
    let res = await whoisQuery(whoisServer, domain, opts);
    if (opts?.followWhoisReferral !== false) {
      const referral = extractWhoisReferral(res.text);
      if (referral && referral.toLowerCase() !== whoisServer.toLowerCase()) {
        try {
          res = await whoisQuery(referral, domain, opts);
        } catch {
          // keep original
        }
      }
    }
    const record: DomainRecord = normalizeWhois(
      domain,
      tld,
      res.text,
      res.serverQueried,
      now,
    );
    return { ok: true, record };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
