import { throwIfAborted } from "../lib/async";
import { classifyError } from "../lib/errors";
import { type LookupContext, traced } from "../lib/trace";
import type { LookupErrorCode, LookupOptions } from "../types";
import { whoisQuery } from "./client";
import { WHOIS_TLD_EXCEPTIONS } from "./servers";

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
export function parseIanaRegistrationInfoUrl(text: string): string | undefined {
  const lines = String(text).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!/^\s*(remarks|url|website)\s*:/i.test(line)) continue;
    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (urlMatch?.[0]) return urlMatch[0];
  }
  return undefined;
}

const IANA_WHOIS_HOST = "whois.iana.org";

/** Result of {@link discoverWhoisServer}. */
export interface WhoisDiscovery {
  /** Authoritative WHOIS server for the TLD, if one was found */
  server?: string;
  /** Raw IANA response, when IANA was queried successfully */
  ianaText?: string;
  /** Why the IANA query failed, when it did (timeouts and connection errors are otherwise silent) */
  ianaFailure?: { code: LookupErrorCode; error: string };
}

/** Query IANA's WHOIS for a TLD, recording the attempt. Throws on failure. */
async function queryIana(
  tld: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<string> {
  const res = await traced(ctx, { phase: "iana", server: IANA_WHOIS_HOST }, () =>
    whoisQuery(IANA_WHOIS_HOST, tld.toLowerCase(), options),
  );
  return res.text;
}

/**
 * Discover the authoritative WHOIS server for a TLD in a single IANA round trip, keeping the
 * IANA text (for registration-info hints) and any failure (so callers can report it accurately).
 * Caller aborts and deadlines are rethrown rather than swallowed.
 */
export async function discoverWhoisServer(
  tld: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<WhoisDiscovery> {
  const key = tld.toLowerCase();
  // 1) Explicit hint override
  const hint = options?.whoisHints?.[key];
  if (hint) return { server: normalizeServer(hint) };

  // 2) IANA WHOIS authoritative discovery over TCP 43
  const out: WhoisDiscovery = {};
  try {
    const text = await queryIana(key, options, ctx);
    out.ianaText = text;
    const server = parseIanaWhoisServer(text);
    if (server) return { ...out, server: normalizeServer(server) };
  } catch (err) {
    throwIfAborted(options?.signal);
    out.ianaFailure = classifyError(err);
  }

  // 3) Curated exceptions
  const exception = WHOIS_TLD_EXCEPTIONS[key];
  if (exception) return { ...out, server: normalizeServer(exception) };

  return out;
}

/** Fetch raw IANA WHOIS text for a TLD (best-effort). */
export async function getIanaWhoisTextForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string | undefined> {
  try {
    return await queryIana(tld, options);
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
  ctx?: LookupContext,
): Promise<string | undefined> {
  return (await discoverWhoisServer(tld, options, ctx)).server;
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
