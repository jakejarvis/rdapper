import { beforeEach, expect, it, vi } from "vitest";
import { lookupDomain } from "./index.js";
import * as whoisClient from "./whois/client.js";

vi.mock("./whois/discovery.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "./whois/discovery.js",
  );
  return {
    ...actual,
    ianaWhoisServerForTld: vi.fn(async () => "whois.verisign-grs.com"),
  };
});

vi.mock("./whois/client.js", () => ({
  whoisQuery: vi.fn(async (server: string) => {
    if (server === "whois.verisign-grs.com") {
      return {
        text: "Registrar WHOIS Server: whois.registrar.test\nDomain Name: EXAMPLE.COM",
        serverQueried: "whois.verisign-grs.com",
      };
    }
    return {
      text: "Domain Name: EXAMPLE.COM\nRegistrar: Registrar LLC",
      serverQueried: "whois.registrar.test",
    };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("does not follow referral when followWhoisReferral is false", async () => {
  const res = await lookupDomain("example.com", {
    timeoutMs: 200,
    whoisOnly: true,
    followWhoisReferral: false,
  });
  expect(res.ok, res.error).toBe(true);
  // only the TLD server should be queried
  expect(vi.mocked(whoisClient.whoisQuery)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(whoisClient.whoisQuery).mock.calls[0][0]).toBe(
    "whois.verisign-grs.com",
  );
});

it("includes rawWhois when includeRaw is true", async () => {
  const res = await lookupDomain("example.com", {
    timeoutMs: 200,
    whoisOnly: true,
    followWhoisReferral: true,
    includeRaw: true,
  });
  expect(res.ok, res.error).toBe(true);
  expect(res.record?.source).toBe("whois");
  expect(res.record?.rawWhois && res.record.rawWhois.length > 0).toBe(true);
});
