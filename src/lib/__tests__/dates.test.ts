/** biome-ignore-all lint/style/noNonNullAssertion: this is fine for tests */

import assert from "node:assert/strict";
import test from "node:test";
import { toISO } from "../dates.js";

test("toISO parses ISO and common whois formats", () => {
  const iso = toISO("2023-01-02T03:04:05Z");
  assert.equal(iso, "2023-01-02T03:04:05Z");

  const noZ = toISO("2023-01-02 03:04:05");
  assert.match(noZ!, /^2023-01-02T03:04:05Z$/);

  const slash = toISO("2023/01/02 03:04:05");
  assert.match(slash!, /^2023-01-02T03:04:05Z$/);

  const dmy = toISO("02-Jan-2023");
  assert.equal(dmy, "2023-01-02T00:00:00Z");

  const mdy = toISO("Jan 02 2023");
  assert.equal(mdy, "2023-01-02T00:00:00Z");
});
