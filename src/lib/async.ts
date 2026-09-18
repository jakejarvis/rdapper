import { DEFAULT_TIMEOUT_MS } from "./constants";
import { abortError, RdapperError } from "./errors";

/**
 * Resolve the per-operation timeout. A finite value > 0 is used as-is;
 * anything else (0, negative, NaN, Infinity) means "no timeout".
 */
export function resolveTimeoutMs(opts?: { timeoutMs?: number }): number | undefined {
  const ms = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** Throw the appropriate abort/deadline error if `signal` has fired. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

/**
 * Manual equivalent of `AbortSignal.any`: aborts (with the same reason) when any input aborts.
 * Hand-rolled so it works under fake timers and on runtimes lacking the static helpers.
 * Call `dispose` when finished to detach listeners from long-lived signals.
 */
export function linkSignals(...signals: (AbortSignal | undefined)[]): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const ctrl = new AbortController();
  const cleanups: (() => void)[] = [];
  const dispose = () => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  };
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      ctrl.abort(s.reason);
      dispose();
      break;
    }
    const onAbort = () => {
      ctrl.abort(s.reason);
      dispose();
    };
    s.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => s.removeEventListener("abort", onAbort));
  }
  return { signal: ctrl.signal, dispose };
}

/**
 * Run `fn` with a signal that aborts on timeout or when `parentSignal` aborts.
 * The whole of `fn` (including reading a response body) is covered by the timer, and the
 * underlying request is cancelled on timeout. `Promise.race` remains as a backstop for
 * custom fetch implementations that ignore `signal`.
 */
export async function withTimeout<T>(
  timeoutMs: number | undefined,
  reason: string,
  parentSignal: AbortSignal | undefined,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  throwIfAborted(parentSignal);
  const timeoutCtrl = new AbortController();
  const link = linkSignals(parentSignal, timeoutCtrl.signal);
  const signal = link.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => timeoutCtrl.abort(new RdapperError("timeout", reason)), timeoutMs);
  }
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
  });
  try {
    return await Promise.race([fn(signal), aborted]);
  } catch (err) {
    // Whatever the fetch rejected with, an abort/timeout we triggered is the real cause
    if (signal.aborted) throw abortError(signal);
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    link.dispose();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
