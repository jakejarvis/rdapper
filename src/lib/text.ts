export function uniq<T>(arr: T[] | undefined | null): T[] | undefined {
  if (!arr) return undefined;
  return Array.from(new Set(arr));
}

/** Drop items whose key was already seen, keeping the first. */
export function uniqBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function parseKeyValueLines(text: string): Record<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (key: string, value?: string) => {
    const list = map.get(key) ?? [];
    if (value) list.push(value);
    map.set(key, list);
  };
  const lines = text.split(/\r?\n/);
  let lastKey: string | undefined;
  // True while inside a header-style block ("Key:" alone on its line, values below)
  let inHeaderBlock = false;
  // The header a block of nested "Key: value" lines sits under, and its indentation
  let section: { key: string; indent: number } | undefined;
  let blankSinceValue = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      blankSinceValue = true;
      section = undefined;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const afterBlank = blankSinceValue;
    blankSinceValue = false;
    // Bracketed form: [Key] value  (common in .jp and some ccTLDs)
    const bracket = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (bracket?.[1] !== undefined && bracket?.[2] !== undefined) {
      const key = bracket[1].trim().toLowerCase();
      add(key, bracket[2].trim());
      lastKey = key;
      inHeaderBlock = false;
      continue;
    }
    // Values of a header-style block may contain colons (URLs, times) that are not key
    // separators, e.g. "     Registered on 28th December 2018 at 05:54:43.861" (.gg/.je).
    // Indented values may follow anywhere; unindented ones (.bg, .pl "REGISTRAR:") only right
    // under the header. After a blank line only a single token can start the values (.hk
    // nameservers), since a phrase there is the next section's title.
    if (inHeaderBlock && lastKey && !/:(\s|$)/.test(line)) {
      const firstToken = !map.get(lastKey)?.length && !/\s/.test(line.trim());
      if (indent > 0 || !afterBlank || firstToken) {
        add(lastKey, line.trim());
        continue;
      }
    }
    // Colon form: Key: value
    const idx = line.indexOf(":");
    if (idx !== -1) {
      // Some registries pad keys with dots: "created............: 15.8.2017" (.fi, .no)
      const key = line
        .slice(0, idx)
        .replace(/\.{2,}\s*$/, "")
        .trim()
        .toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (!key) {
        lastKey = undefined;
        continue;
      }
      add(key, value);
      // Nested under a header, the key is also recorded with the header's name:
      // "Registrar:" + "    Name: X" gives "registrar name" (.eu, .be, .it, .uk)
      if (section && indent > section.indent) add(`${section.key} ${key}`, value);
      else section = value ? undefined : { key, indent };
      lastKey = key;
      inHeaderBlock = !value;
      continue;
    }
    // A short unindented line without a colon is a section header: "Nameservers", "Registrar"
    // (.it, .fi)
    if (indent === 0 && /^[A-Za-z][A-Za-z ()/-]{0,39}$/.test(line)) {
      const key = line.trim().toLowerCase();
      add(key);
      lastKey = key;
      inHeaderBlock = true;
      section = { key, indent };
      continue;
    }
    // Continuation line: starts with indentation after a key appeared
    if (lastKey && indent > 0) add(lastKey, line.trim());
    // Otherwise ignore non key-value lines
  }
  return Object.fromEntries(map);
}

/**
 * Parse each blank-line-separated block of a WHOIS reply on its own, in order. Block-structured
 * registries put the domain's fields first and repeat keys like "created" in later contact and
 * nameserver blocks, which {@link parseKeyValueLines} merges into one list.
 */
export function parseKeyValueBlocks(text: string): Array<Record<string, string[]>> {
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .filter((block) => block.trim())
    .map(parseKeyValueLines);
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
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  return undefined;
}
