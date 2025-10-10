import { expect, test } from "vitest";
import { getDomainParts, isLikelyDomain, toRegistrableDomain } from "./domain";

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
  expect(toRegistrableDomain("http://www.writethedocs.org/conf")).toBe(
    "writethedocs.org",
  );

  // Private/public SLDs should collapse to ICANN TLD + SLD by default
  // (ICANN-only behavior; private suffixes ignored)
  expect(toRegistrableDomain("spark-public.s3.amazonaws.com")).toBe(
    "amazonaws.com",
  );

  // Reject IPs and invalid inputs
  expect(toRegistrableDomain("192.168.0.1")).toBeNull();
  expect(toRegistrableDomain("http://[::1]/")).toBeNull();
  expect(toRegistrableDomain("")).toBeNull();
});
