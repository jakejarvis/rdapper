import { expect, test } from "vitest";
import { getDomainParts, isLikelyDomain, toAsciiDomain, toRegistrableDomain } from "./domain";

test("getDomainParts.tld basic", () => {
  expect(getDomainParts("example.com").publicSuffix).toBe("com");
  expect(getDomainParts("sub.example.co.uk").publicSuffix).toBe("co.uk");
});

test("isLikelyDomain", () => {
  expect(isLikelyDomain("example.com")).toBe(true);
  expect(isLikelyDomain("not a domain")).toBe(false);
});

test("toRegistrableDomain normalizes eTLD+1 and rejects non-ICANN", () => {
  // Basic domains
  expect(toRegistrableDomain("example.com")).toBe("example.com");
  expect(toRegistrableDomain("http://www.writethedocs.org/conf")).toBe("writethedocs.org");

  // Private/public SLDs should collapse to ICANN TLD + SLD by default
  // (ICANN-only behavior; private suffixes ignored)
  expect(toRegistrableDomain("spark-public.s3.amazonaws.com")).toBe("amazonaws.com");

  // Reject IPs and invalid inputs
  expect(toRegistrableDomain("192.168.0.1")).toBeNull();
  expect(toRegistrableDomain("http://[::1]/")).toBeNull();
  expect(toRegistrableDomain("")).toBeNull();
});

test("toAsciiDomain normalizes whitespace, case, trailing dots, and Unicode", () => {
  expect(toAsciiDomain("  Example.COM.\t")).toBe("example.com");
  expect(toAsciiDomain("example.com\r")).toBe("example.com");
  expect(toAsciiDomain("münchen.de")).toBe("xn--mnchen-3ya.de");
  expect(toAsciiDomain("例え.jp")).toBe("xn--r8jz45g.jp");
  expect(toAsciiDomain("https://example.com/")).toBeUndefined();
  expect(toAsciiDomain("example.com:43")).toBeUndefined();
  expect(toAsciiDomain("ex ample.com")).toBeUndefined();
});

test("isLikelyDomain accepts Unicode and trailing dots, rejects IPs", () => {
  expect(isLikelyDomain("münchen.de")).toBe(true);
  expect(isLikelyDomain("example.com.")).toBe(true);
  expect(isLikelyDomain("xn--mnchen-3ya.de")).toBe(true);
  expect(isLikelyDomain("192.168.1.10")).toBe(false);
  expect(isLikelyDomain("-bad.com")).toBe(false);
});

test("toRegistrableDomain honors allowPrivateDomains", () => {
  expect(toRegistrableDomain("foo.github.io")).toBe("github.io");
  expect(toRegistrableDomain("foo.github.io", { allowPrivateDomains: true })).toBe("foo.github.io");
  expect(toRegistrableDomain("www.example.co.uk", { allowPrivateDomains: true })).toBe(
    "example.co.uk",
  );
});
