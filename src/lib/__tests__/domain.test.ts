import assert from "node:assert/strict";
import test from "node:test";
import { extractTld, isLikelyDomain } from "../domain.js";

test("extractTld basic", () => {
  assert.equal(extractTld("example.com"), "com");
  assert.equal(extractTld("sub.example.co.uk"), "uk");
});

test("isLikelyDomain", () => {
  assert.equal(isLikelyDomain("example.com"), true);
  assert.equal(isLikelyDomain("not a domain"), false);
});
