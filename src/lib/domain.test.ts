import { expect, test } from "vitest";
import { getDomainParts, isLikelyDomain } from "./domain";

test("getDomainParts.tld basic", () => {
  expect(getDomainParts("example.com").tld).toBe("com");
  expect(getDomainParts("sub.example.co.uk").tld).toBe("uk");
});

test("isLikelyDomain", () => {
  expect(isLikelyDomain("example.com")).toBe(true);
  expect(isLikelyDomain("not a domain")).toBe(false);
});
