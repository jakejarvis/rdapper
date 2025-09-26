/** biome-ignore-all lint/style/noNonNullAssertion: this is fine for tests */

import { expect, test } from "vitest";
import { toISO } from "../dates.js";

test("toISO parses ISO and common whois formats", () => {
  const iso = toISO("2023-01-02T03:04:05Z");
  expect(iso).toBe("2023-01-02T03:04:05Z");

  const noZ = toISO("2023-01-02 03:04:05");
  expect(noZ!).toMatch(/^2023-01-02T03:04:05Z$/);

  const slash = toISO("2023/01/02 03:04:05");
  expect(slash!).toMatch(/^2023-01-02T03:04:05Z$/);

  const dmy = toISO("02-Jan-2023");
  expect(dmy).toBe("2023-01-02T00:00:00Z");

  const mdy = toISO("Jan 02 2023");
  expect(mdy).toBe("2023-01-02T00:00:00Z");
});
