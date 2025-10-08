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
