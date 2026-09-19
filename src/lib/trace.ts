import type { LookupAttempt } from "../types";
import { classifyError, RdapperError } from "./errors";

const attemptByError = new WeakMap<object, LookupAttempt>();

/** The failed attempt (if any) that produced this thrown error. */
export function attemptForError(err: unknown): LookupAttempt | undefined {
  return typeof err === "object" && err !== null ? attemptByError.get(err) : undefined;
}

/** Mutable per-lookup state shared by every phase. */
export interface LookupContext {
  attempts: LookupAttempt[];
}

/** Extra fields a traced operation may attach to its attempt record. */
export type AttemptNotes = Partial<Pick<LookupAttempt, "partial">>;

/**
 * Time `fn` and record the outcome in `ctx.attempts`. Rethrows on failure.
 * A no-op when `ctx` is undefined so internals can still be called directly.
 */
export async function traced<T>(
  ctx: LookupContext | undefined,
  meta: { phase: LookupAttempt["phase"]; server: string },
  fn: (notes: AttemptNotes) => Promise<T>,
): Promise<T> {
  if (!ctx) return fn({});
  const notes: AttemptNotes = {};
  const start = Date.now();
  try {
    const result = await fn(notes);
    ctx.attempts.push({ ...meta, ok: true, durationMs: Date.now() - start, ...notes });
    return result;
  } catch (err) {
    const { code, error, retryAfterMs } = classifyError(err);
    const attempt: LookupAttempt = {
      ...meta,
      ok: false,
      durationMs: Date.now() - start,
      errorCode: code,
      error,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      ...(err instanceof RdapperError && err.stage ? { stage: err.stage } : {}),
      ...notes,
    };
    ctx.attempts.push(attempt);
    if (typeof err === "object" && err !== null && !attemptByError.has(err)) {
      attemptByError.set(err, attempt);
    }
    throw err;
  }
}
