import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared, safe default mocks. Individual describes override implementations as needed.
vi.mock("./rdap/bootstrap.js", () => ({
  getRdapBaseUrlsForTld: vi.fn(async () => ["https://rdap.example/"]),
}));

vi.mock("./rdap/client.js", () => ({
  fetchRdapDomain: vi.fn(async () => ({
    url: "https://rdap.example/domain/example.com",
    json: { ldhName: "example.com", links: [] },
  })),
}));

vi.mock("./rdap/merge.js", () => ({
  fetchAndMergeRdapRelated: vi.fn(async (_domain: string, json: unknown) => ({
    merged: json,
    serversTried: [],
  })),
}));

vi.mock("./whois/client.js", () => ({
  whoisQuery: vi.fn(async () => ({
    text: "Domain Name: EXAMPLE.COM",
    serverQueried: "whois.verisign-grs.com",
  })),
}));

vi.mock("./whois/referral.js", async () => {
  const client = await import("./whois/client.js");
  return {
    followWhoisReferrals: vi.fn(
      async (
        server: string,
        domain: string,
        opts?: import("./types").LookupOptions,
      ) => client.whoisQuery(server, domain, opts),
    ),
    collectWhoisReferralChain: vi.fn(
      async (
        server: string,
        domain: string,
        opts?: import("./types").LookupOptions,
      ) => [await client.whoisQuery(server, domain, opts)],
    ),
  };
});

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

import { lookupDomain } from ".";
import * as rdapClient from "./rdap/client";
import type { WhoisQueryResult } from "./whois/client";
import * as whoisClient from "./whois/client";
import * as discovery from "./whois/discovery";
import * as whoisReferral from "./whois/referral";

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
    // Ensure chain collector is used and only initial TLD response is returned
    const original = vi.mocked(whoisReferral.collectWhoisReferralChain);
    original.mockClear();

    const res = await lookupDomain("example.com", {
      timeoutMs: 200,
      whoisOnly: true,
      followWhoisReferral: false,
    });
    expect(res.ok, res.error).toBe(true);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("includes rawWhois when includeRaw is true", async () => {
    vi.mocked(whoisReferral.followWhoisReferrals).mockImplementation(
      async (_server: string, _domain: string): Promise<WhoisQueryResult> => ({
        text: "Domain Name: EXAMPLE.COM\nRegistrar: Registrar LLC",
        serverQueried: "whois.registrar.test",
      }),
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
