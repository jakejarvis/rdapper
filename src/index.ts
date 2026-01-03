import { getDomainParts, isLikelyDomain } from "./lib/domain";
import { getRdapBaseUrlsForTld } from "./rdap/bootstrap";
import { fetchRdapDomain } from "./rdap/client";
import { fetchAndMergeRdapRelated } from "./rdap/merge";
import { normalizeRdap } from "./rdap/normalize";
import type { DomainRecord, LookupOptions, LookupResult } from "./types";
import {
  getIanaWhoisTextForTld,
  ianaWhoisServerForTld,
  parseIanaRegistrationInfoUrl,
} from "./whois/discovery";
import { mergeWhoisRecords } from "./whois/merge";
import { normalizeWhois } from "./whois/normalize";
import {
  collectWhoisReferralChain,
  followWhoisReferrals,
} from "./whois/referral";

/**
 * High-level lookup that prefers RDAP and falls back to WHOIS.
 * Ensures a standardized DomainRecord, independent of the source.
 */
export async function lookup(
  domain: string,
  opts?: LookupOptions,
): Promise<LookupResult> {
  try {
    if (!isLikelyDomain(domain)) {
      return { ok: false, error: "Input does not look like a domain" };
    }

    const { publicSuffix: tld } = getDomainParts(domain);
    if (!tld) {
      return { ok: false, error: "Invalid TLD" };
    }

    // If WHOIS-only, skip RDAP path
    if (!opts?.whoisOnly) {
      let bases = await getRdapBaseUrlsForTld(tld, opts);
      // Some ccTLD registries publish RDAP only at the registry TLD (e.g., br),
      // while the public suffix can be multi-label (e.g., com.br). Fallback to last label.
      if (bases.length === 0 && tld.includes(".")) {
        const registryTld = tld.split(".").pop() ?? tld;
        bases = await getRdapBaseUrlsForTld(registryTld, opts);
      }
      const tried: string[] = [];
      for (const base of bases) {
        tried.push(base);
        try {
          const { json, notFound } = await fetchRdapDomain(domain, base, opts);

          // HTTP 404 = domain not registered
          if (notFound) {
            const record: DomainRecord = {
              domain,
              tld,
              isRegistered: false,
              rdapServers: tried,
              source: "rdap",
            };
            return { ok: true, record };
          }

          const rdapEnriched = await fetchAndMergeRdapRelated(
            domain,
            json,
            opts,
          );
          const record: DomainRecord = normalizeRdap(
            domain,
            tld,
            rdapEnriched.merged,
            [...tried, ...rdapEnriched.serversTried],
            !!opts?.includeRaw,
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
          error: `RDAP not available or failed for TLD '${tld}'. Many TLDs do not publish RDAP; try WHOIS fallback (omit rdapOnly).`,
        };
      }
    }

    // WHOIS fallback path
    const whoisServer = await ianaWhoisServerForTld(tld, opts);
    if (!whoisServer) {
      // Provide a clearer, actionable message
      const ianaText = await getIanaWhoisTextForTld(tld, opts);
      const regUrl = ianaText
        ? parseIanaRegistrationInfoUrl(ianaText)
        : undefined;
      const hint = regUrl ? ` See registration info at ${regUrl}.` : "";
      return {
        ok: false,
        error: `No WHOIS server discovered for TLD '${tld}'. This registry may not publish public WHOIS over port 43.${hint}`,
      };
    }

    // Query the TLD server first; optionally follow registrar referrals (multi-hop)
    // Collect the chain and coalesce so we don't lose details when a registrar returns minimal/empty data.
    const chain = await collectWhoisReferralChain(whoisServer, domain, opts);
    if (chain.length === 0) {
      // Fallback to previous behavior as a safety net
      const res = await followWhoisReferrals(whoisServer, domain, opts);
      const record: DomainRecord = normalizeWhois(
        domain,
        tld,
        res.text,
        res.serverQueried,
        !!opts?.includeRaw,
      );
      return { ok: true, record };
    }

    // Normalize all WHOIS texts in the chain and merge conservatively
    const normalizedRecords = chain.map((r) =>
      normalizeWhois(domain, tld, r.text, r.serverQueried, !!opts?.includeRaw),
    );
    const [first, ...rest] = normalizedRecords;
    if (!first) {
      return { ok: false, error: "No WHOIS data retrieved" };
    }
    const mergedRecord = rest.length ? mergeWhoisRecords(first, rest) : first;
    return { ok: true, record: mergedRecord };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Determine if a domain appears available (not registered).
 * Performs a lookup and resolves to a boolean. Rejects on lookup error.
 */
export async function isAvailable(
  domain: string,
  opts?: LookupOptions,
): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === false;
}

/**
 * Determine if a domain appears registered.
 * Performs a lookup and resolves to a boolean. Rejects on lookup error.
 */
export async function isRegistered(
  domain: string,
  opts?: LookupOptions,
): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === true;
}

/**
 * @deprecated Use `lookup` instead.
 */
export const lookupDomain = lookup;

export {
  getDomainParts,
  getDomainTld,
  isLikelyDomain,
  toRegistrableDomain,
} from "./lib/domain";
export type * from "./types";
