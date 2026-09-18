import type { LookupAttempt, LookupErrorCode } from "../types";

/**
 * Error thrown by rdapper internals with a machine-readable code.
 * Aborts are named "AbortError" so callers that sniff `err.name` keep working.
 */
export class RdapperError extends Error {
  readonly code: LookupErrorCode;
  readonly phase?: LookupAttempt["phase"];
  readonly server?: string;
  readonly stage?: "connect" | "read";

  constructor(
    code: LookupErrorCode,
    message: string,
    extra?: {
      phase?: LookupAttempt["phase"];
      server?: string;
      stage?: "connect" | "read";
      cause?: unknown;
    },
  ) {
    super(message, extra?.cause !== undefined ? { cause: extra.cause } : undefined);
    this.name = code === "aborted" ? "AbortError" : "RdapperError";
    this.code = code;
    this.phase = extra?.phase;
    this.server = extra?.server;
    this.stage = extra?.stage;
  }
}

/**
 * The error to surface for an aborted signal. A deadline (or any other internal abort)
 * carries its own RdapperError as the reason; anything else is a caller abort.
 */
export function abortError(signal: AbortSignal): RdapperError {
  const reason: unknown = signal.reason;
  if (reason instanceof RdapperError) return reason;
  return new RdapperError("aborted", "Lookup aborted", { cause: reason });
}

const CONNECT_ERRNOS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EAI_AGAIN",
  "EPIPE",
  "EPERM",
  "EACCES",
]);

function errnoOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  // Dual-stack connects fail with an AggregateError whose per-address errors carry the code
  const inner = (err as { errors?: unknown }).errors;
  return Array.isArray(inner) ? inner.map(errnoOf).find(Boolean) : undefined;
}

/** A non-empty description of `err`; Node's AggregateErrors have an empty `message`. */
function describeError(err: unknown, errno: string | undefined): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message) return message;
  const inner = (err as { errors?: unknown } | null)?.errors;
  if (Array.isArray(inner)) {
    const parts = inner.map((e) => (e instanceof Error ? e.message : String(e))).filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return errno ?? (err instanceof Error ? err.name : "Unknown error");
}

/** Map any thrown value to a stable error code plus a human-readable message. */
export function classifyError(err: unknown): { code: LookupErrorCode; error: string } {
  if (err instanceof RdapperError) return { code: err.code, error: err.message };

  const name = err instanceof Error ? err.name : "";
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  const errno = errnoOf(err) ?? errnoOf(cause);
  const message = describeError(err, errno);
  if (name === "AbortError") return { code: "aborted", error: message };
  if (name === "TimeoutError") return { code: "timeout", error: message };

  // undici reports network failures as an opaque "fetch failed" with the details in `cause`
  const error = message === "fetch failed" && errno ? `${message} (${errno})` : message;
  if (errno === "ETIMEDOUT" || errno === "UND_ERR_CONNECT_TIMEOUT") {
    return { code: "timeout", error };
  }
  if (errno && CONNECT_ERRNOS.has(errno)) return { code: "connect_failed", error };
  return { code: "unknown", error };
}
