import type { LookupOptions } from "../types.js";
import { whoisQuery } from "./client.js";
import { WHOIS_TLD_EXCEPTIONS } from "./servers.js";

/**
 * Best-effort discovery of the authoritative WHOIS server for a TLD via IANA root DB.
 */
export async function ianaWhoisServerForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string | undefined> {
  const key = tld.toLowerCase();
  // 1) Explicit hint override
  const hint = options?.whoisHints?.[key];
  if (hint) return normalizeServer(hint);

  // 2) IANA WHOIS authoritative discovery over TCP 43
  try {
    const res = await whoisQuery("whois.iana.org", key, options);
    const txt = res.text;
    const m =
      txt.match(/^whois:\s*(\S+)/im) ||
      txt.match(/^refer:\s*(\S+)/im) ||
      txt.match(/^whois server:\s*(\S+)/im);
    const server = m?.[1];
    if (server) return normalizeServer(server);
  } catch {
    // fallthrough to exceptions/guess
  }

  // 3) Curated exceptions
  const exception = WHOIS_TLD_EXCEPTIONS[key];
  if (exception) return normalizeServer(exception);

  return undefined;
}

/**
 * Extract registrar referral WHOIS server from a WHOIS response, if present.
 */
export function extractWhoisReferral(text: string): string | undefined {
  const patterns = [
    /^Registrar WHOIS Server:\s*(.+)$/im,
    /^Whois Server:\s*(.+)$/im,
    /^ReferralServer:\s*whois:\/\/(.+)$/im,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function normalizeServer(server: string): string {
  return server.replace(/^whois:\/\//i, "").replace(/\/$/, "");
}
