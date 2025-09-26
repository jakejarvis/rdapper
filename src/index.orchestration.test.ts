import { beforeEach, describe, expect, it, vi } from "vitest";

// RDAP success path: RDAP returns JSON and WHOIS is not called
vi.mock("./rdap/client.js", () => ({
  fetchRdapDomain: vi.fn(async () => ({ json: { ldhName: "example.com" } })),
}));

// WHOIS client will be spied on to ensure it's not used in RDAP success test
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

// Mock RDAP bootstrap to avoid network and provide a base URL
vi.mock("./rdap/bootstrap.js", () => ({
  getRdapBaseUrlsForTld: vi.fn(async () => ["https://rdap.example/"]),
}));

import { lookupDomain } from "./index.js";
import * as rdapClient from "./rdap/client.js";
import * as whoisClient from "./whois/client.js";

describe("lookupDomain orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
