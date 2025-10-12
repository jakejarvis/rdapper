// src/whois/edge-mock.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("net", () => {
  throw new Error("node:net unavailable (edge)");
});

describe("edge runtime behavior", () => {
  it("throws a clear error when WHOIS hits node:net on edge", async () => {
    const { whoisQuery } = await import("../whois/client");
    await expect(whoisQuery("whois.iana.org", "com")).rejects.toThrow(
      /WHOIS client is only available in Node.js runtimes/,
    );
  });
});
