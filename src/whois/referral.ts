import { isWhoisAvailable } from "../lib/domain";
import type { LookupOptions } from "../types";
import type { WhoisQueryResult } from "./client";
import { whoisQuery } from "./client";
import { extractWhoisReferral } from "./discovery";

/**
 * Follow registrar WHOIS referrals up to a configured hop limit.
 * Returns the last successful WHOIS response (best-effort; keeps original on failures).
 */
export async function followWhoisReferrals(
  initialServer: string,
  domain: string,
  opts?: LookupOptions,
): Promise<WhoisQueryResult> {
  const maxHops = Math.max(0, opts?.maxWhoisReferralHops ?? 2);
  // First query against the provided server
  let current = await whoisQuery(initialServer, domain, opts);
  if (opts?.followWhoisReferral === false || maxHops === 0) return current;

  const visited = new Set<string>([normalize(current.serverQueried)]);
  let hops = 0;
  // Iterate while we see a new referral and are under hop limit
  while (hops < maxHops) {
    const next = extractWhoisReferral(current.text);
    if (!next) break;
    const normalized = normalize(next);
    if (visited.has(normalized)) break; // cycle protection / same as current
    visited.add(normalized);
    try {
      const res = await whoisQuery(next, domain, opts);
      // Prefer authoritative TLD response when registrar contradicts availability
      const registeredBefore = !isWhoisAvailable(current.text);
      const registeredAfter = !isWhoisAvailable(res.text);
      if (registeredBefore && !registeredAfter) {
        // Registrar claims availability but TLD shows registered: keep TLD
        break;
      }
      current = res; // adopt registrar when it does not downgrade registration
    } catch {
      // If referral server fails, stop following and keep the last good response
      break;
    }
    hops += 1;
  }
  return current;
}

/**
 * Collect the WHOIS referral chain starting from the TLD server.
 * Always includes the initial TLD response; may include one or more registrar responses.
 * Stops on contradiction (registrar claims availability) or failures.
 */
export async function collectWhoisReferralChain(
  initialServer: string,
  domain: string,
  opts?: LookupOptions,
): Promise<WhoisQueryResult[]> {
  const results: WhoisQueryResult[] = [];
  const maxHops = Math.max(0, opts?.maxWhoisReferralHops ?? 2);
  const first = await whoisQuery(initialServer, domain, opts);
  results.push(first);
  if (opts?.followWhoisReferral === false || maxHops === 0) return results;

  const visited = new Set<string>([normalize(first.serverQueried)]);
  let current = first;
  let hops = 0;
  while (hops < maxHops) {
    const next = extractWhoisReferral(current.text);
    if (!next) break;
    const normalized = normalize(next);
    if (visited.has(normalized)) break;
    visited.add(normalized);
    try {
      const res = await whoisQuery(next, domain, opts);
      // If registrar claims availability while TLD indicated registered, stop.
      const registeredBefore = !isWhoisAvailable(current.text);
      const registeredAfter = !isWhoisAvailable(res.text);
      if (registeredBefore && !registeredAfter) {
        // Do not adopt or append contradictory registrar; keep authoritative TLD only.
        break;
      }
      results.push(res);
      current = res;
    } catch {
      break;
    }
    hops += 1;
  }
  return results;
}

function normalize(server: string): string {
  return server.replace(/^whois:\/\//i, "").toLowerCase();
}
