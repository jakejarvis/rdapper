import { withTimeout } from "../lib/async";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants";
import type { LookupOptions } from "../types";

export interface WhoisQueryResult {
  serverQueried: string;
  text: string;
}

/**
 * Some WHOIS servers default to non-English responses. This mapping allows automatic
 * query transformation to request English-only output for easier parsing.
 *
 * To add new servers: Add an entry with the hostname and transformation function:
 *   "whois.example.org": (query) => `${query}/english`,
 */
const WHOIS_QUERY_TRANSFORMERS: Record<string, (query: string) => string> = {
  "whois.jprs.jp": (query) => `${query}/e`, // Append /e for English-only response
};

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

  // Transform query if server requires special formatting
  const transformer = WHOIS_QUERY_TRANSFORMERS[host];
  const transformedQuery = transformer ? transformer(query) : query;

  const text = await withTimeout(
    queryTcp(host, port, transformedQuery, options),
    timeoutMs,
    "WHOIS timeout",
  );
  return { serverQueried: server, text };
}

// Low-level WHOIS TCP client. Some registries require CRLF after the domain query.
async function queryTcp(
  host: string,
  port: number,
  query: string,
  options?: LookupOptions,
): Promise<string> {
  let net: typeof import("node:net") | null;
  try {
    net = await import("node:net");
  } catch {
    net = null;
  }

  if (!net?.createConnection) {
    throw new Error(
      "WHOIS client is only available in Node.js runtimes; try setting `rdapOnly: true`.",
    );
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
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
