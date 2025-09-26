import { expect, test } from "vitest";
import { extractTld, isLikelyDomain } from "./domain.js";

test("extractTld basic", () => {
  expect(extractTld("example.com")).toBe("com");
  expect(extractTld("sub.example.co.uk")).toBe("uk");
});

test("isLikelyDomain", () => {
  expect(isLikelyDomain("example.com")).toBe(true);
  expect(isLikelyDomain("not a domain")).toBe(false);
});
