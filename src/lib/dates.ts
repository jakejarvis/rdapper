// Lightweight date parsing helpers to avoid external dependencies.
// We aim to parse common RDAP and WHOIS date representations and return a UTC ISO string.
export function toISO(dateLike: string | number | Date | undefined | null): string | undefined {
  if (dateLike == null) return undefined;
  if (dateLike instanceof Date) return toIsoFromDate(dateLike);
  if (typeof dateLike === "number") return toIsoFromDate(new Date(dateLike));
  const raw = String(dateLike).trim();
  if (!raw) return undefined;
  // Try several structured formats seen in WHOIS outputs (treat as UTC when no TZ provided)
  const tryFormats = [
    // 2023-01-02 03:04:05Z or without Z
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:Z|([+-]\d{2})(?::?(\d{2}))?)?$/,
    // 2023/01/02 03:04:05
    /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:Z|([+-]\d{2})(?::?(\d{2}))?)?$/,
    // 02-Jan-2023
    /^(\d{2})-([A-Za-z]{3})-(\d{4})$/,
    // 21-07-2026 (DD-MM-YYYY used by .il, .hk)
    /^(\d{2})-(\d{2})-(\d{4})$/,
    // Jan 02 2023
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/,
    // 20261004161638 (compact YYYYMMDDHHMMSS, used by .ua)
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    // 20260319 (compact YYYYMMDD, used by .br)
    /^(\d{4})(\d{2})(\d{2})$/,
  ];
  for (const re of tryFormats) {
    const m = raw.match(re);
    if (!m) continue;
    const d = parseDateWithRegex(m, re);
    if (d) return toIsoFromDate(d);
  }
  // 28th December 2018 [at 05:54:43[.861]] (used by .gg/.je)
  const ordinal = raw.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?)?$/,
  );
  if (ordinal) {
    const [, dd, mon, yyyy, hh, mm, ss] = ordinal;
    const monthIdx = MONTHS[mon?.toLowerCase() ?? ""];
    if (monthIdx !== undefined) {
      return toIsoFromDate(
        new Date(
          Date.UTC(
            Number(yyyy),
            monthIdx,
            Number(dd),
            Number(hh ?? 0),
            Number(mm ?? 0),
            Number(ss ?? 0),
          ),
        ),
      );
    }
  }
  // Fallback to native Date parsing (handles ISO and RFC2822 with TZ)
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return toIsoFromDate(native);
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

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

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

function parseDateWithRegex(m: RegExpMatchArray, _re: RegExp): Date | undefined {
  const monthMap: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  try {
    // If the matched string contains time components, parse as Y-M-D H:M:S
    if (m[0].includes(":") || /^\d{14}$/.test(m[0])) {
      const [_, y, mo, d, hh, mm, ss, offH, offM] = m;
      if (!y || !mo || !d || !hh || !mm || !ss) return undefined;
      // Base time as UTC
      let dt = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
      // Apply timezone offset if present (e.g., +0000, -0500, +05:30)
      if (offH) {
        const sign = offH.startsWith("-") ? -1 : 1;
        const hours = Math.abs(Number(offH));
        const minutes = offM ? Number(offM) : 0;
        const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
        // The captured time is local with an explicit offset; convert to UTC
        dt -= offsetMs;
      }
      return new Date(dt);
    }
    // Compact YYYYMMDD
    if (/^\d{8}$/.test(m[0])) {
      const [_, y, mo, d] = m;
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    }
    // If the matched string contains hyphens, check if numeric (DD-MM-YYYY) or alpha (DD-MMM-YYYY)
    if (m[0].includes("-")) {
      const [_, dd, monStr, yyyy] = m;
      if (!monStr || !dd || !yyyy) return undefined;
      // Check if month component is numeric (DD-MM-YYYY) or alphabetic (DD-MMM-YYYY)
      if (/^\d+$/.test(monStr)) {
        // DD-MM-YYYY format (e.g., 21-07-2026)
        return new Date(Date.UTC(Number(yyyy), Number(monStr) - 1, Number(dd)));
      }
      // DD-MMM-YYYY format (e.g., 02-Jan-2023)
      const mon = monthMap[monStr.toLowerCase()];
      return new Date(Date.UTC(Number(yyyy), mon, Number(dd)));
    }
    // Otherwise treat as MMM DD YYYY
    const [_, monStr, dd, yyyy] = m;
    if (!monStr || !dd || !yyyy) return undefined;
    const mon = monthMap[monStr.toLowerCase()];
    return new Date(Date.UTC(Number(yyyy), mon, Number(dd)));
  } catch {
    // fall through to undefined
  }
  return undefined;
}
