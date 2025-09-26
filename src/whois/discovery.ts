import type { LookupOptions } from "../types.js";
import { whoisQuery } from "./client.js";
import { WHOIS_TLD_EXCEPTIONS } from "./servers.js";

/**
 * Parse the IANA WHOIS response for a TLD and extract the WHOIS server
 * without crossing line boundaries. Some TLDs (e.g. .np) leave the field
 * blank, in which case this returns undefined.
 */
export function parseIanaWhoisServer(text: string): string | undefined {
  // Search lines in priority order: whois, refer, whois server
  const fields = ["whois", "refer", "whois server"];
  const lines = String(text).split(/\r?\n/);
  for (const field of fields) {
    for (const raw of lines) {
      const line = raw.trimEnd();
      // Match beginning of line, allowing leading spaces, case-insensitive
      const re = new RegExp(`^\\s*${field}\\s*:\\s*(.*?)$`, "i");
      const m = line.match(re);
      if (m) {
        const value = (m[1] || "").trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

/**
 * Parse a likely registration information URL from an IANA WHOIS response.
 * Looks at lines like:
 *   remarks: Registration information: http://example.tld
 *   url: https://registry.example
 */
export function parseIanaRegistrationInfoUrl(
  text: string,
): string | undefined {
  const lines = String(text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!/^\s*(remarks|url|website)\s*:/i.test(line)) continue;
    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (urlMatch?.[0]) return urlMatch[0];
  }
  return undefined;
}

/** Fetch raw IANA WHOIS text for a TLD (best-effort). */
export async function getIanaWhoisTextForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string | undefined> {
  try {
    const res = await whoisQuery("whois.iana.org", tld.toLowerCase(), options);
    return res.text;
  } catch {
    return undefined;
  }
}

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
    const server = parseIanaWhoisServer(txt);
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
