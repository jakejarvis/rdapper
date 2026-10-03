// Lightweight date parsing helpers to avoid external dependencies.
// We aim to parse common RDAP and WHOIS date representations and return a UTC ISO string.
// A value without a timezone is read as UTC, never in the host's local time.

type Field = string | number | undefined;

// Explicit formats seen in RDAP/WHOIS output, each with how to build the timestamp
const FORMATS: Array<[RegExp, (m: RegExpMatchArray) => number | undefined]> = [
  // Year first: 2023-01-02, 2023/01/02 03:04:05 (.jp), 2023-01-02T03:04:05.123+05:30,
  // and "1996. 07. 20." (.kr)
  [
    /^(\d{4})([-/.])\s?(\d{1,2})\2\s?(\d{1,2})\.?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i,
    (m) => utc(m[1], m[3], m[4], m[5], m[6], m[7], m[8]),
  ],
  // Day first: 21-07-2026 (.il, .hk), 10.03.2008 12:00:00 (.rs, .mk), 03/10/1991 00:00:00 (.pt).
  // US order is assumed only when the second field can't be a month.
  [
    /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i,
    (m) =>
      Number(m[3]) > 12 && Number(m[1]) <= 12
        ? utc(m[4], m[1], m[3], m[5], m[6], m[7], m[8])
        : utc(m[4], m[3], m[1], m[5], m[6], m[7], m[8]),
  ],
  // 02-Jan-2023
  [/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/, (m) => utc(m[3], monthOf(m[2]), m[1])],
  // Jan 02 2023
  [/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/, (m) => utc(m[3], monthOf(m[1]), m[2])],
  // 20261004161638 (compact YYYYMMDDHHMMSS, used by .ua)
  [/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, (m) => utc(m[1], m[2], m[3], m[4], m[5], m[6])],
  // 20260319 (compact YYYYMMDD, used by .br)
  [/^(\d{4})(\d{2})(\d{2})$/, (m) => utc(m[1], m[2], m[3])],
  // 28th December 2018 [at 05:54:43[.861]] (used by .gg/.je)
  [
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?)?$/,
    (m) => utc(m[3], monthOf(m[2]), m[1], m[4], m[5], m[6]),
  ],
];

// Zone names the formats above and the native parser don't know: "(JST)" (.jp), "CLST"/"CLT" (.cl)
const ZONE_OFFSETS: Record<string, string> = { JST: "+0900", CLT: "-0400", CLST: "-0300" };

export function toISO(dateLike: string | number | Date | undefined | null): string | undefined {
  if (dateLike == null) return undefined;
  if (dateLike instanceof Date) return toIsoFromDate(dateLike);
  if (typeof dateLike === "number") return toIsoFromDate(new Date(dateLike));
  const raw = normalizeZone(String(dateLike).trim());
  if (!raw) return undefined;
  for (const [re, build] of FORMATS) {
    const m = raw.match(re);
    if (!m) continue;
    const ms = build(m);
    if (ms !== undefined) return toIsoFromDate(new Date(ms));
  }
  // Anything else goes to the native parser (RFC 2822, "Tue Jan 01 2000", ...), which reads a
  // value without a zone as local time: pin those to UTC.
  const hasZone = /\b(?:UTC?|GMT|[ECMP][SD]T)\b|(?:\dZ|[+-]\d{2}:?\d{2})$/i.test(raw);
  for (const candidate of hasZone ? [raw] : [`${raw} UTC`, `${raw}Z`]) {
    const native = new Date(candidate);
    if (!Number.isNaN(native.getTime())) return toIsoFromDate(native);
  }
  return undefined;
}

/**
 * Like toISO, but for values with extra noise around the timestamp
 * (e.g. "0-UANIC 20111004161638", "OK-UNTIL 20261004161638"): if the whole string doesn't parse,
 * try each whitespace-separated token that looks like a date.
 */
export function toISOFromTokens(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const whole = toISO(value);
  if (whole) return whole;
  for (const token of value.trim().split(/\s+/)) {
    if (!/^\d[\d\-/:.TZ+]{5,}$/.test(token)) continue;
    const iso = toISO(token);
    if (iso) return iso;
  }
  return undefined;
}

/**
 * Rewrite zone suffixes as numeric offsets ("(UTC+8)" from .tw, the names in ZONE_OFFSETS), and
 * drop the stray "Z" after an explicit offset ("+0000Z", seen in RDAP).
 */
function normalizeZone(raw: string): string {
  return raw
    .replace(
      /\s*\((?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?\)$/i,
      (_m, sign: string, hh: string, mm: string | undefined) =>
        ` ${sign}${hh.padStart(2, "0")}${mm ?? "00"}`,
    )
    .replace(/\s*\(?\b([A-Z]{3,4})\)?$/, (whole, name: string) => {
      const offset = ZONE_OFFSETS[name];
      return offset ? ` ${offset}` : whole;
    })
    .replace(/([+-]\d{2}:?\d{2})Z$/i, "$1");
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthOf(name: string | undefined): number | undefined {
  return MONTHS[name?.toLowerCase() ?? ""];
}

/**
 * Epoch milliseconds for a UTC calendar time, shifted by an optional zone ("Z", "+0530", "-05").
 * Out-of-range fields (month 13, 31 February) give undefined rather than rolling over.
 */
function utc(
  year: Field,
  month: Field,
  day: Field,
  hours: Field = 0,
  minutes: Field = 0,
  seconds: Field = 0,
  zone?: string,
): number | undefined {
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hours);
  const mi = Number(minutes);
  const s = Number(seconds);
  if (![y, mo, d, h, mi, s].every(Number.isFinite) || h > 23 || mi > 59 || s > 59) {
    return undefined;
  }
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
  return ms - offsetMs(zone);
}

function offsetMs(zone: string | undefined): number {
  const m = zone?.match(/^([+-])(\d{2}):?(\d{2})?$/);
  if (!m) return 0; // no zone, "Z", "UTC", "GMT"
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60 * 1000;
}

function toIsoFromDate(d: Date): string | undefined {
  try {
    return new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        0,
      ),
    )
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
  } catch {
    return undefined;
  }
}
