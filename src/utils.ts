import psl from "psl";

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
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:Z)?$/,
    // 2023/01/02 03:04:05
    /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
    // 02-Jan-2023
    /^(\d{2})-([A-Za-z]{3})-(\d{4})$/,
    // Jan 02 2023
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/,
  ];
  for (const re of tryFormats) {
    const m = raw.match(re);
    if (!m) continue;
    const d = parseWithRegex(m, re);
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

function parseWithRegex(m: RegExpMatchArray, _re: RegExp): Date | undefined {
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
      const [_, y, mo, d, hh, mm, ss] = m;
      return new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(hh),
          Number(mm),
          Number(ss),
        ),
      );
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

export function uniq<T>(arr: T[] | undefined | null): T[] | undefined {
  if (!arr) return undefined;
  return Array.from(new Set(arr));
}

export function parseKeyValueLines(text: string): Record<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = text.split(/\r?\n/);
  let lastKey: string | undefined;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    // Bracketed form: [Key] value  (common in .jp and some ccTLDs)
    const bracket = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (bracket) {
      const key = bracket[1].trim().toLowerCase();
      const value = bracket[2].trim();
      const list = map.get(key) ?? [];
      if (value) list.push(value);
      map.set(key, list);
      lastKey = key;
      continue;
    }
    // Colon form: Key: value
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (!key) {
        lastKey = undefined;
        continue;
      }
      const list = map.get(key) ?? [];
      if (value) list.push(value);
      map.set(key, list);
      lastKey = key;
      continue;
    }
    // Continuation line: starts with indentation after a key appeared
    if (lastKey && /^\s+/.test(line)) {
      const value = line.trim();
      if (value) {
        const list = map.get(lastKey) ?? [];
        list.push(value);
        map.set(lastKey, list);
      }
    }
    // Otherwise ignore non key-value lines
  }
  return Object.fromEntries(map);
}

export function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function punyToUnicode(domain: string): string {
  try {
    return domain.normalize("NFC");
  } catch {
    return domain;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  reason = "Timeout",
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    timeout,
  ]);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractTld(domain: string): string {
  const lower = domain.trim().toLowerCase();
  try {
    const parsed = psl.parse?.(lower);
    if (!("tld" in parsed)) {
      return lower;
    }
    const suffix = parsed?.tld;
    if (suffix) {
      const labels = String(suffix).split(".").filter(Boolean);
      if (labels.length) return labels[labels.length - 1];
    }
  } catch {
    // ignore and fall back
  }
  const parts = lower.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? lower;
}

export function isLikelyDomain(input: string): boolean {
  return /^[a-z0-9.-]+$/i.test(input) && input.includes(".");
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? (value.filter((x) => typeof x === "string") as string[])
    : undefined;
}

export function asDateLike(value: unknown): string | number | Date | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  )
    return value;
  return undefined;
}
