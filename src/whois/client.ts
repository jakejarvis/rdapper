import { createConnection } from "node:net";
import { DEFAULT_TIMEOUT_MS } from "../config.js";
import { withTimeout } from "../lib/async.js";
import type { LookupOptions } from "../types.js";

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
