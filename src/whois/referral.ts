import { throwIfAborted } from "../lib/async";
import { classifyError, RdapperError } from "../lib/errors";
import { type LookupContext, traced } from "../lib/trace";
import type { LookupOptions } from "../types";
import type { WhoisQueryResult } from "./client";
import { whoisQuery } from "./client";
import { extractWhoisReferral } from "./discovery";
import { isSafeWhoisReferralHost } from "./host";
import { isAvailableByWhois, normalizeWhois } from "./normalize";
import { detectWhoisRefusal, looksEmptyWhois } from "./throttle";

/**
 * Collect the WHOIS referral chain starting from the TLD server.
 * Always includes the initial TLD response; may include one or more registrar responses.
 * Stops on contradiction (registrar claims availability) or failures.
 */
export async function collectWhoisReferralChain(
  initialServer: string,
  domain: string,
  opts?: LookupOptions,
  ctx?: LookupContext,
): Promise<{ results: WhoisQueryResult[]; warnings: string[] }> {
  const results: WhoisQueryResult[] = [];
  const warnings: string[] = [];
  const maxHops = Math.max(0, opts?.maxWhoisReferralHops ?? 2);
  const first = await tracedWhoisQuery(initialServer, domain, opts, ctx);
  results.push(first);
  if (opts?.followWhoisReferral === false || maxHops === 0) return { results, warnings };

  const visited = new Set<string>([normalize(first.serverQueried)]);
  let current = first;
  let hops = 0;
  while (hops < maxHops) {
    throwIfAborted(opts?.signal);
    const next = extractWhoisReferral(current.text);
    if (!next) break;
    const normalized = normalize(next);
    if (!isSafeWhoisReferralHost(normalized)) {
      warnings.push(`Skipped WHOIS referral to unsafe host "${next.slice(0, 100)}"`);
      break;
    }
    if (visited.has(normalized)) break;
    visited.add(normalized);
    try {
      const res = await tracedWhoisQuery(next, domain, opts, ctx, true);
      // If registrar claims availability while TLD indicated registered, stop.
      const registeredBefore = !isAvailableByWhois(current.text);
      const registeredAfter = !isAvailableByWhois(res.text);
      if (registeredBefore && !registeredAfter) {
        // Do not adopt or append contradictory registrar; keep authoritative TLD only.
        break;
      }
      if (
        registeredAfter &&
        looksEmptyWhois(normalizeWhois(domain, "", res.text, res.serverQueried))
      ) {
        warnings.push(`WHOIS referral ${normalized} returned no usable data`);
        break;
      }
      results.push(res);
      current = res;
    } catch (err) {
      throwIfAborted(opts?.signal);
      const { code, error } = classifyError(err);
      warnings.push(
        code === "rate_limited" || code === "blocked"
          ? `WHOIS referral ${normalized} ${code === "blocked" ? "blocked" : "rate limited"} the query`
          : `WHOIS referral ${normalized} failed (${error})`,
      );
      break;
    }
    hops += 1;
  }
  return { results, warnings };
}

function normalize(server: string): string {
  return server.replace(/^whois:\/\//i, "").toLowerCase();
}

/** whoisQuery wrapped so each query (TLD or registrar hop) is recorded as an attempt. */
function tracedWhoisQuery(
  server: string,
  domain: string,
  opts?: LookupOptions,
  ctx?: LookupContext,
  referral = false,
): Promise<WhoisQueryResult> {
  return traced(
    ctx,
    { phase: "whois", server: server.replace(/^whois:\/\//i, "") },
    async (notes) => {
      const res = await whoisQuery(server, domain, opts, { blockPrivateAddresses: referral });
      if (res.partial) notes.partial = true;
      const refusal = detectWhoisRefusal(res.text);
      if (refusal) {
        throw new RdapperError(
          refusal,
          refusal === "blocked"
            ? `WHOIS server ${res.serverQueried} refuses requests from this client`
            : `WHOIS server ${res.serverQueried} rate limited the query`,
          { stage: "read" },
        );
      }
      return res;
    },
  );
}
