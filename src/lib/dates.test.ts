import { expect, test } from "vitest";
import { toISO, toISOFromTokens } from "./dates";

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

test("toISO parses compact YYYYMMDDHHMMSS", () => {
  expect(toISO("20261004161638")).toBe("2026-10-04T16:16:38Z");
});

test("toISOFromTokens extracts a timestamp from noisy strings", () => {
  expect(toISOFromTokens("0-UANIC 20111004161638")).toBe("2011-10-04T16:16:38Z");
  expect(toISOFromTokens("UARR149-UANIC 20251004050127")).toBe("2025-10-04T05:01:27Z");
  expect(toISOFromTokens("0-UANIC")).toBeUndefined();
});

test("toISO parses compact YYYYMMDD, including .br 'created' values with a ticket suffix", () => {
  expect(toISO("20260319")).toBe("2026-03-19T00:00:00Z");
  expect(toISOFromTokens("20260319 #31066859")).toBe("2026-03-19T00:00:00Z");
});

test("toISO reads registry zone suffixes", () => {
  // .jp (JPRS)
  expect(toISO("2026/03/01 01:05:03 (JST)")).toBe("2026-02-28T16:05:03Z");
  // .tw (TWNIC)
  expect(toISO("2099-12-31 23:59:59 (UTC+8)")).toBe("2099-12-31T15:59:59Z");
  // .cl appends CLST (UTC-3) year-round; CLT is UTC-4
  expect(toISO("2030-02-08 21:00:00 CLST")).toBe("2030-02-09T00:00:00Z");
  expect(toISO("1997-08-29 00:00:00 CLT")).toBe("1997-08-29T04:00:00Z");
  // A stray Z after an explicit offset
  expect(toISO("2020-01-01T00:00:00+0000Z")).toBe("2020-01-01T00:00:00Z");
  expect(toISO("2023-01-02 03:04:05 UTC")).toBe("2023-01-02T03:04:05Z");
});

test("toISO reads day-first dates with dots and slashes", () => {
  // .rs / .mk
  expect(toISO("10.03.2008 12:00:00")).toBe("2008-03-10T12:00:00Z");
  expect(toISO("22.05.2032")).toBe("2032-05-22T00:00:00Z");
  // .pt: day first even when both fields could be a month
  expect(toISO("03/10/1991 00:00:00")).toBe("1991-10-03T00:00:00Z");
  expect(toISO("31/12/2026 23:59:00")).toBe("2026-12-31T23:59:00Z");
  // US order only when the second field can't be a month
  expect(toISO("12/31/2026")).toBe("2026-12-31T00:00:00Z");
  // No rollover into the next month
  expect(toISO("31.02.2026")).toBeUndefined();
});

test("toISO reads year-first dates with other separators", () => {
  expect(toISO("2001/02/02")).toBe("2001-02-02T00:00:00Z"); // .jp
  expect(toISO("1996. 07. 20.")).toBe("1996-07-20T00:00:00Z"); // .kr
  expect(toISO("2004.08.18 13:30:03")).toBe("2004-08-18T13:30:03Z");
  expect(toISO("2023-01-02T03:04:05.123Z")).toBe("2023-01-02T03:04:05Z");
  expect(toISO("2023-13-02")).toBeUndefined();
});

test("toISO results do not depend on the host timezone", () => {
  const original = process.env.TZ;
  const inputs = [
    "2001/02/02",
    "1996. 07. 20.",
    "Tue Jan 01 2000",
    "2001-Jan-03.",
    "Mon, 01 Jan 2024 10:00:00",
    "2024-01-15 10:00",
  ];
  const inUtc = inputs.map((i) => toISO(i));
  try {
    process.env.TZ = "Asia/Tokyo";
    expect(new Date(2000, 0, 1).getTimezoneOffset()).toBe(-540);
    expect(inputs.map((i) => toISO(i))).toEqual(inUtc);
    process.env.TZ = "America/Los_Angeles";
    expect(inputs.map((i) => toISO(i))).toEqual(inUtc);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  expect(inUtc).toEqual([
    "2001-02-02T00:00:00Z",
    "1996-07-20T00:00:00Z",
    "2000-01-01T00:00:00Z",
    "2001-01-03T00:00:00Z",
    "2024-01-01T10:00:00Z",
    "2024-01-15T10:00:00Z",
  ]);
});
