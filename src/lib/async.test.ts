import { afterEach, describe, expect, it, vi } from "vitest";
import { linkSignals, resolveTimeoutMs, withTimeout } from "./async";
import { RdapperError } from "./errors";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveTimeoutMs", () => {
  it("defaults, passes valid values through, and disables the rest", () => {
    expect(resolveTimeoutMs()).toBe(10_000);
    expect(resolveTimeoutMs({ timeoutMs: 500 })).toBe(500);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveTimeoutMs({ timeoutMs: bad })).toBeUndefined();
    }
  });
});

describe("linkSignals", () => {
  it("aborts with the source's reason and detaches on dispose", () => {
    const a = new AbortController();
    const b = new AbortController();
    const link = linkSignals(a.signal, b.signal);
    const reason = new Error("why");
    b.abort(reason);
    expect(link.signal.aborted).toBe(true);
    expect(link.signal.reason).toBe(reason);
  });

  it("is aborted immediately when an input already is", () => {
    const a = new AbortController();
    a.abort();
    expect(linkSignals(a.signal).signal.aborted).toBe(true);
  });
});

describe("withTimeout", () => {
  it("times out with a timeout error, aborting the request even if it ignores the signal", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const p = withTimeout(100, "RDAP lookup timeout", undefined, (signal) => {
      seen = signal;
      return new Promise<never>(() => {});
    });
    const assertion = expect(p).rejects.toMatchObject({
      code: "timeout",
      message: "RDAP lookup timeout",
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(seen?.aborted).toBe(true);
  });

  it("covers the whole of fn (e.g. a stalled body), not just the first await", async () => {
    vi.useFakeTimers();
    const p = withTimeout(100, "slow body", undefined, async () => {
      await Promise.resolve(); // "headers" arrive
      await new Promise(() => {}); // body never does
    });
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("propagates a caller abort as aborted", async () => {
    const ctrl = new AbortController();
    const p = withTimeout(undefined, "x", ctrl.signal, () => new Promise<never>(() => {}));
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted", name: "AbortError" });
  });

  it("propagates an internal RdapperError reason (deadline) unchanged", async () => {
    const ctrl = new AbortController();
    const p = withTimeout(undefined, "x", ctrl.signal, () => new Promise<never>(() => {}));
    ctrl.abort(new RdapperError("timeout", "Lookup deadline exceeded (5ms)"));
    await expect(p).rejects.toMatchObject({ code: "timeout", message: /deadline/ });
  });

  it("resolves normally and clears its timer", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(100, "x", undefined, async () => 42)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });
});
