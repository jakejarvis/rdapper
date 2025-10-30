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
    if (bracket?.[1] !== undefined && bracket?.[2] !== undefined) {
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
