import { beforeEach, expect, it, vi } from "vitest";
import { lookupDomain } from "./index.js";

// Simulate a multi-label public suffix scenario where the TLD server says "no match"
vi.mock("./whois/discovery.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "./whois/discovery.js",
  );
  return {
    ...actual,
    ianaWhoisServerForTld: vi.fn(async () => "whois.centralnic.tld"),
  };
});

vi.mock("./whois/client.js", () => ({
  whoisQuery: vi
    .fn()
    // First call: authoritative TLD WHOIS returns "no match"
    .mockImplementationOnce(async () => ({
      text: "No match for domain",
      serverQueried: "whois.centralnic.tld",
    }))
    // Second call: exception server returns some record
    .mockImplementationOnce(async () => ({
      text: "Domain Name: EXAMPLE.UK.COM\nRegistrar: Registrar LLC",
      serverQueried: "whois.centralnic.com",
    })),
}));

// For this test we want publicSuffix to include a dot
vi.mock("./lib/domain.js", async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>("./lib/domain.js");
  return {
    ...actual,
    getDomainParts: vi.fn(() => ({ publicSuffix: "uk.com", tld: "com" })),
  };
});

// Also ensure the exception table includes uk.com
vi.mock("./whois/servers.js", async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>("./whois/servers.js");
  return {
    ...actual,
    WHOIS_TLD_EXCEPTIONS: {
      ...(actual.WHOIS_TLD_EXCEPTIONS as any),
      "uk.com": "whois.centralnic.com",
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

it("tries exception server for multi-label public suffix when TLD says no match", async () => {
  const res = await lookupDomain("example.uk.com", {
    timeoutMs: 200,
    whoisOnly: true,
  });
  expect(res.ok, res.error).toBe(true);
  expect(res.record?.source).toBe("whois");
  expect(res.record?.tld).toBe("com");
  expect(res.record?.whoisServer).toBe("whois.centralnic.com");
});
