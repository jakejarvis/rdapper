import { describe, expect, it } from "vitest";
import { detectWhoisRefusal, looksEmptyWhois } from "./throttle";

describe("detectWhoisRefusal", () => {
  it.each([
    "WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS",
    "Quota exceeded",
    "You have exceeded the allowed number of queries.",
    "Too many requests",
    "<!DOCTYPE html><html><body>Service Unavailable</body></html>",
  ])("classifies %j as rate_limited", (text) => {
    expect(detectWhoisRefusal(text)).toBe("rate_limited");
  });

  it.each([
    "Requests of this client are not permitted. Please use https://www.nic.ch/whois/ for queries.",
    "Your IP address has been blocked",
  ])("classifies %j as blocked", (text) => {
    expect(detectWhoisRefusal(text)).toBe("blocked");
  });

  it.each([
    "This domain name is blocked. Try again later.",
    "Access denied for reserved name. No match for EXAMPLE.COM",
    "No match for EXAMPLE.COM",
    "Domain is banned by policy",
  ])("leaves %j alone", (text) => {
    expect(detectWhoisRefusal(text)).toBeUndefined();
  });

  it("does not flag a long real record that mentions rate limits", () => {
    const record = `Domain Name: EXAMPLE.COM\nRegistrar: Test\n${"Name Server: NS.EXAMPLE.COM\n".repeat(100)}\nNote: queries are subject to rate limiting\n`;
    expect(detectWhoisRefusal(record)).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(detectWhoisRefusal(undefined)).toBeUndefined();
  });
});

describe("looksEmptyWhois", () => {
  const base = { domain: "example.com", tld: "com", isRegistered: true, source: "whois" as const };
  it("is true when nothing useful was parsed", () => {
    expect(looksEmptyWhois(base)).toBe(true);
  });
  it("is false with any real field", () => {
    expect(looksEmptyWhois({ ...base, registrar: { name: "X" } })).toBe(false);
    expect(looksEmptyWhois({ ...base, nameservers: [{ host: "ns.example.com" }] })).toBe(false);
  });
});
