import { describe, expect, it } from "vitest";
import { detectWhoisThrottle, looksEmptyWhois } from "./throttle";

describe("detectWhoisThrottle", () => {
  it.each([
    "WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS",
    "Quota exceeded",
    "You have exceeded the allowed number of queries. Try again later.",
    "Too many requests",
    "<!DOCTYPE html><html><body>Service Unavailable</body></html>",
    "Your IP has been blocked",
  ])("flags %j", (text) => {
    expect(detectWhoisThrottle(text)).toBe(true);
  });

  it("does not flag a long real record that mentions rate limits", () => {
    const record = `Domain Name: EXAMPLE.COM\nRegistrar: Test\n${"Name Server: NS.EXAMPLE.COM\n".repeat(100)}\nNote: queries are subject to rate limiting\n`;
    expect(detectWhoisThrottle(record)).toBe(false);
  });

  it("does not flag empty or ordinary availability text", () => {
    expect(detectWhoisThrottle(undefined)).toBe(false);
    expect(detectWhoisThrottle("No match for EXAMPLE.COM")).toBe(false);
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
