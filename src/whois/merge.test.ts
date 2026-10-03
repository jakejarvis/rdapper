import { describe, expect, it, test, vi } from "vitest";

vi.mock("./client.js", () => ({
  whoisQuery: vi.fn(async (server: string) => {
    if (server === "whois.nic.io") {
      return {
        serverQueried: server,
        text: `Domain Name: GITPOD.IO\nCreation Date: 2019-05-14T00:00:00Z\nRegistry Expiry Date: 2030-05-14T00:00:00Z\nRegistrar WHOIS Server: whois.udag.net\nName Server: A.NS\n`,
      };
    }
    if (server === "whois.udag.net") {
      // Registrar returns minimal/empty or contradictory content
      return { serverQueried: server, text: "NOT FOUND" };
    }
    return { serverQueried: server, text: "" };
  }),
}));

import { mergeWhoisRecords } from "./merge";
import { normalizeWhois } from "./normalize";
import { collectWhoisReferralChain } from "./referral";

describe("WHOIS coalescing", () => {
  it("retains TLD data when registrar provides no details", async () => {
    const { results: chain } = await collectWhoisReferralChain("whois.nic.io", "gitpod.io", {
      followWhoisReferral: true,
      maxWhoisReferralHops: 2,
    });
    // Contradictory registrar should not be appended to chain
    expect(chain.length).toBe(1);

    const [first] = chain;
    if (!first) throw new Error("Expected first record");
    const base = normalizeWhois("gitpod.io", "io", first.text, first.serverQueried, false);
    const merged = mergeWhoisRecords(base, []);
    expect(merged.isRegistered).toBe(true);
    expect(merged.creationDate).toBeDefined();
    expect(merged.whoisServer?.toLowerCase()).toContain("whois.nic.io");
  });
});

test("mergeWhoisRecords keeps the registrar's fuller registrant over the registry's redacted one", () => {
  const registry = normalizeWhois(
    "example.org",
    "org",
    "Domain Name: example.org\nRegistrant Name: REDACTED FOR PRIVACY\nRegistrant Organization: Acme Inc\n",
    "whois.pir.org",
  );
  const registrar = normalizeWhois(
    "example.org",
    "org",
    "Domain Name: example.org\nRegistrant Name: Jane Doe\nRegistrant Organization: Acme Inc\nRegistrant Email: jane@acme.example\n",
    "whois.registrar.test",
  );
  const merged = mergeWhoisRecords(registry, [registrar]);
  expect(merged.contacts).toEqual([
    { type: "registrant", name: "Jane Doe", organization: "Acme Inc", email: "jane@acme.example" },
  ]);
});
