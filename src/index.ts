import { toISO } from "./lib/dates.js";
import { getDomainParts, isLikelyDomain } from "./lib/domain.js";
import { getRdapBaseUrlsForTld } from "./rdap/bootstrap.js";
import { fetchRdapDomain } from "./rdap/client.js";
import { normalizeRdap } from "./rdap/normalize.js";
import type { DomainRecord, LookupOptions, LookupResult } from "./types.js";
import { whoisQuery } from "./whois/client.js";
import {
  extractWhoisReferral,
  ianaWhoisServerForTld,
} from "./whois/discovery.js";
import { normalizeWhois } from "./whois/normalize.js";
import { WHOIS_TLD_EXCEPTIONS } from "./whois/servers.js";

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
    const { publicSuffix, tld } = getDomainParts(domain);
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
    // Query the TLD server first; if it returns a referral, we follow it below.
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

    // If TLD registry returns no match and there was no referral, try multi-label public suffix candidates
    if (
      publicSuffix.includes(".") &&
      /no match|not found/i.test(res.text) &&
      opts?.followWhoisReferral !== false
    ) {
      const candidates: string[] = [];
      const ps = publicSuffix.toLowerCase();
      // Prefer explicit exceptions when known
      const exception = WHOIS_TLD_EXCEPTIONS[ps];
      if (exception) candidates.push(exception);
      for (const server of candidates) {
        try {
          const alt = await whoisQuery(server, domain, opts);
          if (alt.text && !/error/i.test(alt.text)) {
            res = alt;
            break;
          }
        } catch {
          // try next
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

/** Determine if a domain appears available (not registered).
 * Performs a lookup and resolves to a boolean. Rejects on lookup error. */
export async function isAvailable(
  domain: string,
  opts?: LookupOptions,
): Promise<boolean> {
  const res = await lookupDomain(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === false;
}

/** Determine if a domain appears registered.
 * Performs a lookup and resolves to a boolean. Rejects on lookup error. */
export async function isRegistered(
  domain: string,
  opts?: LookupOptions,
): Promise<boolean> {
  const res = await lookupDomain(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === true;
}

export type * from "./types.js";
