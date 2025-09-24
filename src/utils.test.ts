import assert from "node:assert/strict";
import test from "node:test";
import { extractTld, isLikelyDomain, toISO } from "./utils.js";

test("toISO parses ISO and common whois formats", () => {
  const iso = toISO("2023-01-02T03:04:05Z");
  assert.equal(iso, "2023-01-02T03:04:05Z");

  const noZ = toISO("2023-01-02 03:04:05");
  // biome-ignore lint/style/noNonNullAssertion: this is fine
  assert.match(noZ!, /^2023-01-02T03:04:05Z$/);

  const slash = toISO("2023/01/02 03:04:05");
  // biome-ignore lint/style/noNonNullAssertion: this is fine
  assert.match(slash!, /^2023-01-02T03:04:05Z$/);

  const dmy = toISO("02-Jan-2023");
  assert.equal(dmy, "2023-01-02T00:00:00Z");

  const mdy = toISO("Jan 02 2023");
  assert.equal(mdy, "2023-01-02T00:00:00Z");
});

test("extractTld basic", () => {
  assert.equal(extractTld("example.com"), "com");
  assert.equal(extractTld("sub.example.co.uk"), "uk");
});

test("isLikelyDomain", () => {
  assert.equal(isLikelyDomain("example.com"), true);
  assert.equal(isLikelyDomain("not a domain"), false);
});
