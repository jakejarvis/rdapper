/** biome-ignore-all lint/style/noNonNullAssertion: this is fine for tests */

import { expect, test } from "vitest";
import { toISO } from "./dates";

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

  // Registrar style timezone offsets
  const plus0000 = toISO("2025-03-23T10:53:03+0000");
  expect(plus0000).toBe("2025-03-23T10:53:03Z");
  const plus0000Space = toISO("2025-03-23 10:53:03+0000");
  expect(plus0000Space).toBe("2025-03-23T10:53:03Z");
  const plus0530 = toISO("2025-03-23T10:53:03+05:30");
  expect(plus0530).toBe("2025-03-23T05:23:03Z");
});

test("toISO parses DD-MM-YYYY format (used by .il and .hk)", () => {
  // Test the example from the issue
  const ddmmyyyy1 = toISO("21-07-2026");
  expect(ddmmyyyy1).toBe("2026-07-21T00:00:00Z");

  // Test edge cases
  const ddmmyyyy2 = toISO("01-01-2025");
  expect(ddmmyyyy2).toBe("2025-01-01T00:00:00Z");

  const ddmmyyyy3 = toISO("31-12-2025");
  expect(ddmmyyyy3).toBe("2025-12-31T00:00:00Z");

  // Ensure DD-MMM-YYYY (with month name) still works
  const dmmmy = toISO("02-Jan-2023");
  expect(dmmmy).toBe("2023-01-02T00:00:00Z");
});
