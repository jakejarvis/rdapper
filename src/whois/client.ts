import { resolveTimeoutMs, throwIfAborted } from "../lib/async";
import { abortError, RdapperError } from "../lib/errors";
import type { LookupOptions } from "../types";

export interface WhoisQueryResult {
  serverQueried: string;
  text: string;
  /** True when the read timed out after some data had arrived, so `text` may be truncated */
  partial?: boolean;
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
  const port = 43;
  const host = server.replace(/^whois:\/\//i, "");

  // Transform query if server requires special formatting
  const transformer = WHOIS_QUERY_TRANSFORMERS[host];
  const transformedQuery = transformer ? transformer(query) : query;

  const { text, partial } = await queryTcp(host, port, transformedQuery, options);
  return { serverQueried: server, text, ...(partial ? { partial } : {}) };
}

// Low-level WHOIS TCP client. Some registries require CRLF after the domain query.
// The socket code owns the timeout so it can tell a connect timeout from a read timeout,
// and can hand back whatever text arrived before a read timeout.
async function queryTcp(
  host: string,
  port: number,
  query: string,
  options?: LookupOptions,
): Promise<{ text: string; partial?: boolean }> {
  let net: typeof import("node:net") | null;
  try {
    net = await import("node:net");
  } catch {
    net = null;
  }

  if (!net?.createConnection) {
    throw new RdapperError(
      "unsupported_runtime",
      "WHOIS client is only available in Node.js runtimes; try setting `rdapOnly: true`.",
    );
  }

  const signal = options?.signal;
  throwIfAborted(signal);
  const timeoutMs = resolveTimeoutMs(options);
  const createConnection = net.createConnection;

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    let received = 0;
    let connected = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const text = () => Buffer.concat(chunks).toString("utf8");
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      settle();
    };
    const onAbort = () => finish(() => reject(abortError(signal as AbortSignal)));

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        if (!connected) {
          finish(() =>
            reject(
              new RdapperError("timeout", `WHOIS connect timeout (${host})`, {
                stage: "connect",
              }),
            ),
          );
        } else if (received > 0) {
          finish(() => resolve({ text: text(), partial: true }));
        } else {
          finish(() =>
            reject(new RdapperError("timeout", `WHOIS read timeout (${host})`, { stage: "read" })),
          );
        }
      }, timeoutMs);
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      // Servers that reset the connection after replying still gave us an answer
      if (err.code === "ECONNRESET" && received > 0) {
        finish(() => resolve({ text: text(), partial: true }));
      } else {
        finish(() => reject(err));
      }
    });
    socket.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      chunks.push(buf);
      received += buf.length;
    });
    socket.on("end", () => {
      finish(() => resolve({ text: text() }));
    });
    // A close without a preceding end/error (half-open teardown) would otherwise wait out the timer
    socket.on("close", () => {
      if (connected) finish(() => resolve({ text: text() }));
      else {
        finish(() =>
          reject(new RdapperError("connect_failed", `WHOIS connection closed (${host})`)),
        );
      }
    });
    socket.on("connect", () => {
      connected = true;
      socket.write(`${query}\r\n`);
    });
  });
}
