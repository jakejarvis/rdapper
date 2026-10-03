import { describe, expect, it, vi } from "vitest";

vi.mock("./client.js", () => ({
  whoisQuery: vi.fn(async (server: string) => {
    if (server === "whois.nic.io") {
      // TLD WHOIS shows a clearly registered domain and a registrar referral
      return {
        serverQueried: server,
        text: `Domain Name: RAINDROP.IO\nCreation Date: 2013-08-20T20:30:16Z\nRegistry Expiry Date: 2027-08-20T20:30:16Z\nRegistrar WHOIS Server: whois.1api.net\nName Server: BEAU.NS.CLOUDFLARE.COM\nName Server: BARBARA.NS.CLOUDFLARE.COM\n`,
      };
    }
    // Registrar WHOIS contradicts with an availability phrase
    return {
      serverQueried: server,
      text: "No match for RAINDROP.IO",
    };
  }),
}));

import { extractWhoisReferral } from "./discovery";
import { collectWhoisReferralChain } from "./referral";

// Excerpt of Verisign's reply for google.com: every line is indented and CRLF-terminated
const VERISIGN_GOOGLE_COM = [
  "   Domain Name: GOOGLE.COM",
  "   Registry Domain ID: 2138514_DOMAIN_COM-VRSN",
  "   Registrar WHOIS Server: whois.markmonitor.com",
  "   Registrar URL: http://www.markmonitor.com",
  "   Creation Date: 1997-09-15T04:00:00Z",
  "   Registry Expiry Date: 2028-09-14T04:00:00Z",
  "   Registrar: MarkMonitor Inc.",
  "   Name Server: NS1.GOOGLE.COM",
  ">>> Last update of whois database: 2026-10-03T18:28:44Z <<<",
  "",
].join("\r\n");

// Excerpt of MarkMonitor's registrar reply for the same domain
const MARKMONITOR_GOOGLE_COM = [
  "Domain Name: google.com",
  "Registrar WHOIS Server: whois.markmonitor.com",
  "Creation Date: 1997-09-15T07:00:00+0000",
  "Registrar Registration Expiration Date: 2028-09-13T07:00:00+0000",
  "Registrar: MarkMonitor, Inc.",
  "Registrant Organization: Google LLC",
  "Registrant Country: US",
  "Name Server: ns1.google.com",
  "",
].join("\n");

describe("extractWhoisReferral", () => {
  it("reads an indented, CRLF-terminated referral (Verisign)", () => {
    expect(extractWhoisReferral(VERISIGN_GOOGLE_COM)).toBe("whois.markmonitor.com");
  });

  it("does not borrow the next line when the referral field is blank", () => {
    const text = "   Registrar WHOIS Server: \r\n   Registrar URL: http://registrar.test\r\n";
    expect(extractWhoisReferral(text)).toBeUndefined();
  });

  it("falls through a blank field to a later pattern", () => {
    const text = "Registrar WHOIS Server:\nWhois Server: whois.registrar.test\n";
    expect(extractWhoisReferral(text)).toBe("whois.registrar.test");
  });

  it("reads an indented ARIN-style ReferralServer", () => {
    expect(extractWhoisReferral("  ReferralServer:  whois://whois.ripe.net\n")).toBe(
      "whois.ripe.net",
    );
  });
});

describe("WHOIS referral contradiction handling", () => {
  it("collects chain and does not append contradictory registrar", async () => {
    const { results: chain } = await collectWhoisReferralChain("whois.nic.io", "raindrop.io", {
      followWhoisReferral: true,
      maxWhoisReferralHops: 2,
    });
    expect(Array.isArray(chain)).toBe(true);
    // Mocked registrar is contradictory, so chain should contain only the TLD response
    expect(chain.length).toBe(1);
    expect(chain[0]?.serverQueried).toBe("whois.nic.io");
  });
});

describe("WHOIS referral safety", () => {
  it("does not query an unsafe referral host and reports a warning", async () => {
    const { whoisQuery } = await import("./client.js");
    const mocked = vi.mocked(whoisQuery);
    mocked.mockClear();
    mocked.mockImplementation(async (server: string) => ({
      serverQueried: server,
      text: "Domain Name: EVIL.COM\nCreation Date: 2013-08-20T20:30:16Z\nRegistrar WHOIS Server: 169.254.169.254\n",
    }));
    const { results, warnings } = await collectWhoisReferralChain("whois.nic.io", "evil.com", {
      followWhoisReferral: true,
    });
    expect(results).toHaveLength(1);
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(warnings[0]).toMatch(/unsafe host/);
  });

  it("follows the registrar referral in Verisign's indented reply", async () => {
    const { whoisQuery } = await import("./client.js");
    const mocked = vi.mocked(whoisQuery);
    mocked.mockClear();
    mocked.mockImplementation(async (server: string) => ({
      serverQueried: server,
      text: server === "whois.verisign-grs.com" ? VERISIGN_GOOGLE_COM : MARKMONITOR_GOOGLE_COM,
    }));
    const { results, warnings } = await collectWhoisReferralChain(
      "whois.verisign-grs.com",
      "google.com",
      { followWhoisReferral: true },
    );
    expect(results.map((r) => r.serverQueried)).toEqual([
      "whois.verisign-grs.com",
      "whois.markmonitor.com",
    ]);
    expect(warnings).toEqual([]);
  });

  it("keeps the registry record when the registrar throttles", async () => {
    const { whoisQuery } = await import("./client.js");
    vi.mocked(whoisQuery).mockImplementation(async (server: string) => ({
      serverQueried: server,
      text:
        server === "whois.nic.io"
          ? "Domain Name: X.IO\nCreation Date: 2013-08-20T20:30:16Z\nRegistrar WHOIS Server: whois.1api.net\n"
          : "WHOIS LIMIT EXCEEDED",
    }));
    const { results, warnings } = await collectWhoisReferralChain("whois.nic.io", "x.io", {
      followWhoisReferral: true,
    });
    expect(results).toHaveLength(1);
    expect(warnings[0]).toMatch(/rate limited/);
  });
});
