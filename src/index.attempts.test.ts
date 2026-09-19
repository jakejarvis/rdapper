import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RdapperError } from "./lib/errors";
import type { BootstrapData, FetchLike } from "./types";

vi.mock("./whois/client.js", () => ({ whoisQuery: vi.fn() }));

import { lookup } from ".";
import { whoisQuery } from "./whois/client";

const bootstrap: BootstrapData = {
  version: "1.0",
  publication: "2025-01-01T00:00:00Z",
  services: [[["com"], ["https://rdap-a.example/", "https://rdap-b.example/"]]],
};

const whoisText =
  "Domain Name: EXAMPLE.COM\nRegistrar: Test Registrar\nCreation Date: 2001-01-01T00:00:00Z\n";

const never = () => new Promise<never>(() => {});
const rdapOk = (): Response =>
  new Response(JSON.stringify({ ldhName: "example.com", links: [] }), { status: 200 });

/** WHOIS mock that never answers but honours abort like the real socket client. */
function hangingWhois(_server: string, _q: string, opts?: { signal?: AbortSignal }) {
  return new Promise<never>((_, reject) => {
    opts?.signal?.addEventListener("abort", () =>
      reject(
        opts.signal?.reason instanceof RdapperError
          ? opts.signal.reason
          : new RdapperError("aborted", "Lookup aborted"),
      ),
    );
  });
}

beforeEach(() => {
  vi.mocked(whoisQuery).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("throttle and empty-response guards", () => {
  const ianaThen = (text: string) => async (server: string) => ({
    serverQueried: server,
    text: server === "whois.iana.org" ? "whois: whois.verisign-grs.com\n" : text,
  });

  it("fails with rate_limited when the registry throttles", async () => {
    vi.mocked(whoisQuery).mockImplementation(ianaThen("WHOIS LIMIT EXCEEDED"));
    const res = await lookup("example.com", { whoisOnly: true });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("rate_limited");
    expect(res.errorPhase).toBe("whois");
    expect(res.errorServer).toBe("whois.verisign-grs.com");
  });

  it("fails with blocked (not rate_limited) for a permanent refusal", async () => {
    vi.mocked(whoisQuery).mockImplementation(
      ianaThen("Requests of this client are not permitted. Please use https://www.nic.ch/whois/"),
    );
    const res = await lookup("example.com", { whoisOnly: true });
    expect(res.errorCode).toBe("blocked");
  });

  it("fails with unparseable when a long reply has no fields and no availability phrase", async () => {
    vi.mocked(whoisQuery).mockImplementation(ianaThen(`${"lorem ipsum ".repeat(300)}\n`));
    const res = await lookup("example.com", { whoisOnly: true });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("unparseable");
  });

  it("still reports availability for a genuine not-found reply", async () => {
    vi.mocked(whoisQuery).mockImplementation(ianaThen("No match for EXAMPLE.COM"));
    const res = await lookup("example.com", { whoisOnly: true });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.isRegistered).toBe(false);
  });

  it("classifies RDAP 429 as rate_limited and falls through to WHOIS", async () => {
    const customFetch: FetchLike = vi.fn(
      async () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } }),
    );
    vi.mocked(whoisQuery).mockImplementation(ianaThen(whoisText));
    const res = await lookup("example.com", { customBootstrapData: bootstrap, customFetch });
    expect(res.ok, res.error).toBe(true);
    expect(res.attempts[0]).toMatchObject({ errorCode: "rate_limited" });
    expect(res.attempts[0]?.error).toContain("Retry-After: 30");
    expect(res.attempts[0]?.retryAfterMs).toBe(30_000);
  });
});

describe("rdapOnly rate limiting", () => {
  it("surfaces retryAfterMs on the result", async () => {
    const customFetch: FetchLike = vi.fn(
      async () => new Response("", { status: 429, headers: { "retry-after": "12" } }),
    );
    const res = await lookup("example.com", {
      customBootstrapData: bootstrap,
      customFetch,
      rdapOnly: true,
    });
    expect(res.ok).toBe(false);
    expect(res.retryAfterMs).toBe(12_000);
  });
});

describe("attempts trace", () => {
  it("records a failed RDAP base followed by a WHOIS success, in order", async () => {
    const customFetch: FetchLike = vi.fn(async () => new Response("nope", { status: 503 }));
    vi.mocked(whoisQuery).mockImplementation(async (server) => ({
      serverQueried: server,
      text: server === "whois.iana.org" ? "whois: whois.verisign-grs.com\n" : whoisText,
    }));

    const res = await lookup("example.com", { customBootstrapData: bootstrap, customFetch });

    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("whois");
    expect(res.attempts.map((a) => [a.phase, a.server, a.ok])).toEqual([
      ["rdap", "https://rdap-a.example/", false],
      ["rdap", "https://rdap-b.example/", false],
      ["iana", "whois.iana.org", true],
      ["whois", "whois.verisign-grs.com", true],
    ]);
    expect(res.attempts[0]).toMatchObject({ errorCode: "http_error", error: "RDAP 503: nope" });
    for (const a of res.attempts) expect(a.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("includes attempts on a successful RDAP lookup", async () => {
    const customFetch: FetchLike = vi.fn(async () => rdapOk());
    const res = await lookup("example.com", { customBootstrapData: bootstrap, customFetch });
    expect(res.ok, res.error).toBe(true);
    expect(res.attempts).toMatchObject([
      { phase: "rdap", server: "https://rdap-a.example/", ok: true },
    ]);
  });

  it("fetches the bootstrap once for a multi-label public suffix (co.uk)", async () => {
    const customFetch: FetchLike = vi.fn(async (url) =>
      String(url).endsWith("dns.json")
        ? new Response(
            JSON.stringify({ ...bootstrap, services: [[["uk"], ["https://rdap-uk.example/"]]] }),
          )
        : rdapOk(),
    );
    const res = await lookup("example.co.uk", { customFetch });
    expect(res.ok, res.error).toBe(true);
    expect(res.attempts.map((a) => [a.phase, a.server])).toEqual([
      ["rdap_bootstrap", "https://data.iana.org/rdap/dns.json"],
      ["rdap", "https://rdap-uk.example/"],
    ]);
  });

  it("includes attempts on validation failures", async () => {
    expect(await lookup("not a domain")).toMatchObject({
      ok: false,
      errorCode: "invalid_input",
      attempts: [],
    });
  });

  it("marks partial WHOIS reads", async () => {
    vi.mocked(whoisQuery).mockImplementation(async (server) => ({
      serverQueried: server,
      text: whoisText,
      partial: true,
    }));
    const res = await lookup("example.com", {
      whoisOnly: true,
      whoisHints: { com: "whois.example" },
      followWhoisReferral: false,
    });
    expect(res.ok, res.error).toBe(true);
    expect(res.attempts).toMatchObject([
      { phase: "whois", server: "whois.example", partial: true },
    ]);
  });
});

describe("error reporting", () => {
  it("reports a hung IANA as a timeout, with exactly one IANA query", async () => {
    vi.mocked(whoisQuery).mockRejectedValue(
      new RdapperError("timeout", "WHOIS connect timeout (whois.iana.org)", { stage: "connect" }),
    );
    const res = await lookup("example.sh", { whoisOnly: true });

    expect(res).toMatchObject({
      ok: false,
      errorCode: "timeout",
      errorPhase: "iana",
      errorServer: "whois.iana.org",
    });
    expect(res.error).toMatch(/discovery via IANA failed for '\.sh'/);
    expect(res.error).not.toMatch(/may not publish/);
    expect(vi.mocked(whoisQuery)).toHaveBeenCalledTimes(1);
    expect(res.attempts).toMatchObject([{ phase: "iana", ok: false, stage: "connect" }]);
  });

  it("reports no_server when IANA answers without a server", async () => {
    vi.mocked(whoisQuery).mockResolvedValue({
      serverQueried: "whois.iana.org",
      text: "remarks: Registration information: https://nic.example\n",
    });
    const res = await lookup("example.zz", { whoisOnly: true });
    expect(res).toMatchObject({ ok: false, errorCode: "no_server" });
    expect(res.error).toContain("https://nic.example");
    expect(vi.mocked(whoisQuery)).toHaveBeenCalledTimes(1);
  });

  it("reports rdap_unavailable with the last RDAP failure", async () => {
    const customFetch: FetchLike = vi.fn(async () => new Response("down", { status: 500 }));
    const res = await lookup("example.com", {
      rdapOnly: true,
      customBootstrapData: bootstrap,
      customFetch,
    });
    expect(res).toMatchObject({
      ok: false,
      errorCode: "rdap_unavailable",
      errorPhase: "rdap",
      errorServer: "https://rdap-b.example/",
    });
    expect(res.error).toContain("RDAP 500: down");
    expect(vi.mocked(whoisQuery)).not.toHaveBeenCalled();
  });

  it("surfaces an unsupported runtime from IANA discovery", async () => {
    vi.mocked(whoisQuery).mockRejectedValue(new RdapperError("unsupported_runtime", "no net"));
    const res = await lookup("example.sh", { whoisOnly: true });
    expect(res).toMatchObject({ ok: false, errorCode: "unsupported_runtime" });
  });
});

describe("timeouts, deadline and abort", () => {
  it("aborts a stalled RDAP body read at timeoutMs", async () => {
    vi.useFakeTimers();
    const customFetch: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        json: never,
        text: never,
      }) as unknown as Response;
    const p = lookup("example.com", {
      rdapOnly: true,
      timeoutMs: 1000,
      customBootstrapData: { ...bootstrap, services: [[["com"], ["https://rdap-a.example/"]]] },
      customFetch,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.attempts[0]).toMatchObject({ phase: "rdap", ok: false, errorCode: "timeout" });
  });

  it("deadlineMs bounds the whole lookup instead of N x timeoutMs", async () => {
    vi.useFakeTimers();
    const customFetch: FetchLike = vi.fn(never); // ignores its signal on purpose
    vi.mocked(whoisQuery).mockImplementation(hangingWhois);
    const start = Date.now();
    const p = lookup("example.com", {
      customBootstrapData: bootstrap,
      customFetch,
      timeoutMs: 10_000,
      deadlineMs: 2500,
    });
    await vi.advanceTimersByTimeAsync(2500);
    const res = await p;
    expect(Date.now() - start).toBe(2500);
    expect(res).toMatchObject({ ok: false, errorCode: "timeout" });
    expect(res.error).toBe("Lookup deadline exceeded (2500ms)");
    // The deadline stops the lookup: no second RDAP base, no WHOIS fallback
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(whoisQuery)).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deadlineMs cancels a hung WHOIS phase", async () => {
    vi.useFakeTimers();
    vi.mocked(whoisQuery).mockImplementation(hangingWhois);
    const p = lookup("example.com", { whoisOnly: true, timeoutMs: 10_000, deadlineMs: 1500 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toMatchObject({
      ok: false,
      errorCode: "timeout",
      errorPhase: "iana",
    });
  });

  it("a caller abort during RDAP does not fall through to WHOIS", async () => {
    const ctrl = new AbortController();
    const customFetch: FetchLike = (_url, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("boom")));
        queueMicrotask(() => ctrl.abort());
      });
    const res = await lookup("example.com", {
      customBootstrapData: bootstrap,
      customFetch,
      signal: ctrl.signal,
    });
    expect(res).toMatchObject({ ok: false, errorCode: "aborted" });
    expect(vi.mocked(whoisQuery)).not.toHaveBeenCalled();
  });

  it("an already-aborted signal fails fast", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const customFetch: FetchLike = vi.fn(async () => rdapOk());
    const res = await lookup("example.com", {
      customBootstrapData: bootstrap,
      customFetch,
      signal: ctrl.signal,
    });
    expect(res).toMatchObject({ ok: false, errorCode: "aborted" });
    expect(customFetch).not.toHaveBeenCalled();
  });

  it("aborting during bootstrap fetch is not swallowed", async () => {
    const ctrl = new AbortController();
    const customFetch: FetchLike = (_url, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("boom")));
        queueMicrotask(() => ctrl.abort());
      });
    const res = await lookup("example.com", { customFetch, signal: ctrl.signal });
    expect(res).toMatchObject({ ok: false, errorCode: "aborted" });
    expect(vi.mocked(whoisQuery)).not.toHaveBeenCalled();
  });
});
