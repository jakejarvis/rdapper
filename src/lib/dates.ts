// Lightweight date parsing helpers to avoid external dependencies.
// We aim to parse common RDAP and WHOIS date representations and return a UTC ISO string.
export function toISO(
  dateLike: string | number | Date | undefined | null,
): string | undefined {
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
    // Jan 02 2023
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/,
  ];
  for (const re of tryFormats) {
    const m = raw.match(re);
    if (!m) continue;
    const d = parseDateWithRegex(m, re);
    if (d) return toIsoFromDate(d);
  }
  // Fallback to native Date parsing (handles ISO and RFC2822 with TZ)
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return toIsoFromDate(native);
  return undefined;
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

function parseDateWithRegex(
  m: RegExpMatchArray,
  _re: RegExp,
): Date | undefined {
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
    if (m[0].includes(":")) {
      const [_, y, mo, d, hh, mm, ss, offH, offM] = m;
      // Base time as UTC
      let dt = Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss),
      );
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
    // If the matched string contains hyphens, treat as DD-MMM-YYYY
    if (m[0].includes("-")) {
      const [_, dd, monStr, yyyy] = m;
      const mon = monthMap[monStr.toLowerCase()];
      return new Date(Date.UTC(Number(yyyy), mon, Number(dd)));
    }
    // Otherwise treat as MMM DD YYYY
    const [_, monStr, dd, yyyy] = m;
    const mon = monthMap[monStr.toLowerCase()];
    return new Date(Date.UTC(Number(yyyy), mon, Number(dd)));
  } catch {
    // fall through to undefined
  }
  return undefined;
}
