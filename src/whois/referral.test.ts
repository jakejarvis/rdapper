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

import { followWhoisReferrals } from "./referral";

describe("WHOIS referral contradiction handling", () => {
  it("keeps TLD WHOIS when registrar claims availability", async () => {
    const res = await followWhoisReferrals("whois.nic.io", "raindrop.io", {
      followWhoisReferral: true,
      maxWhoisReferralHops: 2,
    });
    expect(res.serverQueried).toBe("whois.nic.io");
    // ensure we didn't adopt the registrar response
    expect(res.text.toLowerCase().includes("creation date")).toBe(true);
    expect(res.text.toLowerCase().includes("no match")).toBe(false);
  });
});
