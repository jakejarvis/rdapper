import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared, safe default mocks. Individual describes override implementations as needed.
vi.mock("./rdap/bootstrap.js", () => ({
  getRdapBaseUrlsForTld: vi.fn(async () => ["https://rdap.example/"]),
}));

vi.mock("./rdap/client.js", () => ({
  fetchRdapDomain: vi.fn(async () => ({
    url: "https://rdap.example/domain/example.com",
    json: { ldhName: "example.com" },
  })),
}));

vi.mock("./whois/client.js", () => ({
  whoisQuery: vi.fn(async () => ({
    text: "Domain Name: EXAMPLE.COM",
    serverQueried: "whois.verisign-grs.com",
  })),
}));

vi.mock("./whois/discovery.js", async () => {
  const actual = await vi.importActual("./whois/discovery.js");
  return {
    ...actual,
    ianaWhoisServerForTld: vi.fn(async () => "whois.verisign-grs.com"),
  };
});

vi.mock("./lib/domain.js", async () => {
  const actual =
    await vi.importActual<typeof import("./lib/domain.js")>("./lib/domain.js");
  return {
    ...actual,
    // Default to actual behavior; specific tests can override
    getDomainParts: vi.fn((domain: string) => actual.getDomainParts(domain)),
  };
});

import { lookupDomain } from "./index.js";
import * as domain from "./lib/domain.js";
import * as rdapClient from "./rdap/client.js";
import type { WhoisQueryResult } from "./whois/client.js";
import * as whoisClient from "./whois/client.js";
import * as discovery from "./whois/discovery.js";

// 1) Orchestration tests (RDAP path, fallback, whoisOnly)
describe("lookupDomain orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discovery.ianaWhoisServerForTld).mockResolvedValue(
      "whois.verisign-grs.com",
    );
  });

  it("uses RDAP when available and does not call WHOIS", async () => {
    const res = await lookupDomain("example.com", { timeoutMs: 200 });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("rdap");
    expect(vi.mocked(rdapClient.fetchRdapDomain)).toHaveBeenCalledOnce();
    expect(vi.mocked(whoisClient.whoisQuery)).not.toHaveBeenCalled();
  });

  it("falls back to WHOIS when RDAP fails", async () => {
    vi.mocked(rdapClient.fetchRdapDomain).mockRejectedValueOnce(
      new Error("rdap down"),
    );
    const res = await lookupDomain("example.com", { timeoutMs: 200 });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("whois");
    expect(vi.mocked(whoisClient.whoisQuery)).toHaveBeenCalledOnce();
  });

  it("respects whoisOnly to skip RDAP entirely", async () => {
    const res = await lookupDomain("example.com", {
      timeoutMs: 200,
      whoisOnly: true,
    });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("whois");
    expect(vi.mocked(rdapClient.fetchRdapDomain)).not.toHaveBeenCalled();
    expect(vi.mocked(whoisClient.whoisQuery)).toHaveBeenCalled();
  });
});

// 2) WHOIS referral toggle and includeRaw behavior
describe("WHOIS referral & includeRaw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discovery.ianaWhoisServerForTld).mockResolvedValue(
      "whois.verisign-grs.com",
    );
  });

  it("does not follow referral when followWhoisReferral is false", async () => {
    vi.mocked(whoisClient.whoisQuery).mockImplementation(
      async (server: string): Promise<WhoisQueryResult> => {
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
      },
    );

    const res = await lookupDomain("example.com", {
      timeoutMs: 200,
      whoisOnly: true,
      followWhoisReferral: false,
    });
    expect(res.ok, res.error).toBe(true);
    expect(vi.mocked(whoisClient.whoisQuery)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(whoisClient.whoisQuery).mock.calls[0][0]).toBe(
      "whois.verisign-grs.com",
    );
  });

  it("includes rawWhois when includeRaw is true", async () => {
    vi.mocked(whoisClient.whoisQuery).mockImplementation(
      async (server: string): Promise<WhoisQueryResult> => {
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
      },
    );

    const res = await lookupDomain("example.com", {
      timeoutMs: 200,
      whoisOnly: true,
      followWhoisReferral: true,
      includeRaw: true,
    });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("whois");
    expect(Boolean(res.record?.rawWhois)).toBe(true);
  });
});

// 3) Multi-label public suffix fallback via exceptions (e.g., uk.com)
describe("WHOIS multi-label public suffix fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discovery.ianaWhoisServerForTld).mockResolvedValue(
      "whois.centralnic.tld",
    );
    vi.mocked(domain.getDomainParts).mockReturnValue({
      publicSuffix: "uk.com",
      tld: "com",
    });
  });

  it("tries exception server for multi-label public suffix when TLD says no match", async () => {
    const whois = vi.mocked(whoisClient.whoisQuery);
    whois.mockReset();
    whois
      .mockImplementationOnce(
        async (): Promise<WhoisQueryResult> => ({
          text: "No match for domain",
          serverQueried: "whois.centralnic.tld",
        }),
      )
      .mockImplementationOnce(
        async (): Promise<WhoisQueryResult> => ({
          text: "Domain Name: EXAMPLE.UK.COM\nRegistrar: Registrar LLC",
          serverQueried: "whois.centralnic.com",
        }),
      );

    const res = await lookupDomain("example.uk.com", {
      timeoutMs: 200,
      whoisOnly: true,
    });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.source).toBe("whois");
    expect(res.record?.tld).toBe("com");
    expect(res.record?.whoisServer).toBe("whois.centralnic.com");
  });
});
