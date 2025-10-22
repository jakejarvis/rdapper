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

describe("query transformation for non-English WHOIS servers", () => {
  it("should append /e to queries for whois.jprs.jp", async () => {
    // Mock net module to capture the query being sent
    let capturedQuery = "";

    vi.doMock("node:net", () => ({
      createConnection: () => {
        return {
          on: (event: string, callback: (arg?: unknown) => void) => {
            if (event === "connect") {
              // Capture the query that will be written
              setTimeout(() => callback(), 0);
            } else if (event === "end") {
              setTimeout(() => callback(), 10);
            }
          },
          write: (data: string) => {
            capturedQuery = data.replace(/\r\n$/, ""); // Strip CRLF
          },
          destroy: () => {},
          setTimeout: () => {},
        };
      },
    }));

    const { whoisQuery } = await import("../whois/client");

    try {
      await whoisQuery("whois.jprs.jp", "hairtect.jp");
    } catch {
      // Query may fail since we're mocking, but we just want to check the query format
    }

    expect(capturedQuery).toBe("hairtect.jp/e");
  });
});
