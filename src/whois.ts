import { createConnection } from "node:net";
import { DEFAULT_TIMEOUT_MS } from "./config.js";
import type { LookupOptions } from "./types.js";
import { withTimeout } from "./utils.js";

export interface WhoisQueryResult {
  serverQueried: string;
  text: string;
}

/**
 * Perform a WHOIS query against an RFC 3912 server over TCP 43.
 * Returns the raw text and the server used.
 */
export async function whoisQuery(
  server: string,
  query: string,
  options?: LookupOptions,
): Promise<WhoisQueryResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const port = 43;
  const host = server.replace(/^whois:\/\//i, "");
  const text = await withTimeout(
    queryTcp(host, port, query, options),
    timeoutMs,
    "WHOIS timeout",
  );
  return { serverQueried: server, text };
}

// Low-level WHOIS TCP client. Some registries require CRLF after the domain query.
function queryTcp(
  host: string,
  port: number,
  query: string,
  options?: LookupOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let data = "";
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      socket.destroy();
    };
    socket.setTimeout((options?.timeoutMs ?? DEFAULT_TIMEOUT_MS) - 1000, () => {
      cleanup();
      reject(new Error("WHOIS socket timeout"));
    });
    socket.on("error", (err) => {
      cleanup();
      reject(err);
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => {
      cleanup();
      resolve(data);
    });
    socket.on("connect", () => {
      socket.write(`${query}\r\n`);
    });
  });
}

/**
 * Best-effort discovery of the authoritative WHOIS server for a TLD via IANA root DB.
 */
export async function ianaWhoisServerForTld(
  tld: string,
  options?: LookupOptions,
): Promise<string | undefined> {
  const url = `https://www.iana.org/domains/root/db/${encodeURIComponent(tld)}.html`;
  try {
    const res = await withTimeout(
      fetch(url, { method: "GET" }),
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) return undefined;
    const html = await res.text();
    const m =
      html.match(/Whois Server:\s*<a[^>]*>([^<]+)<\/a>/i) ||
      html.match(/Whois Server:\s*([^<\n]+)/i);
    const server = m?.[1]?.trim();
    if (!server) return undefined;
    return server.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  } catch {
    return undefined;
  }
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
