import { describe, expect, it } from "vitest";
import { classifyError, RdapperError } from "./errors";

function errno(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}

describe("classifyError", () => {
  it.each(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"])(
    "maps %s to connect_failed",
    (code) => {
      expect(classifyError(errno(code)).code).toBe("connect_failed");
    },
  );

  it("maps ETIMEDOUT to timeout", () => {
    expect(classifyError(errno("ETIMEDOUT")).code).toBe("timeout");
  });

  it("maps AbortError to aborted", () => {
    const err = new DOMException("This operation was aborted", "AbortError");
    expect(classifyError(err).code).toBe("aborted");
  });

  it("uses the code carried by an RdapperError", () => {
    const err = new RdapperError("http_error", "RDAP 500: boom");
    expect(classifyError(err)).toEqual({ code: "http_error", error: "RDAP 500: boom" });
  });

  it("reads errno codes from an undici-style cause and surfaces them", () => {
    const err = new TypeError("fetch failed", { cause: errno("ECONNRESET") });
    expect(classifyError(err)).toEqual({
      code: "connect_failed",
      error: "fetch failed (ECONNRESET)",
    });
  });

  it("describes an empty-message AggregateError from its per-address errors", () => {
    const err = new AggregateError([errno("ECONNREFUSED", "connect ECONNREFUSED 1.2.3.4:43")], "");
    expect(classifyError(err)).toEqual({
      code: "connect_failed",
      error: "connect ECONNREFUSED 1.2.3.4:43",
    });
    expect(classifyError(new AggregateError([], "")).error).toBe("AggregateError");
  });

  it("falls back to unknown for anything else", () => {
    expect(classifyError(new Error("weird"))).toEqual({ code: "unknown", error: "weird" });
    expect(classifyError("just a string")).toEqual({ code: "unknown", error: "just a string" });
  });

  it("names aborted RdapperErrors AbortError for backwards compatibility", () => {
    expect(new RdapperError("aborted", "x").name).toBe("AbortError");
  });
});
