// No `node:` imports here: this module is loaded in every runtime, WHOIS transport is not.

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".localdomain", ".lan", ".home"];

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Parse an IPv6 literal into eight 16-bit groups (no zone ids, no brackets). */
function parseIpv6(ip: string): number[] | null {
  if (!ip.includes(":") || ip.includes("%")) return null;
  let text = ip;
  // Embedded dotted IPv4 tail, e.g. ::ffff:127.0.0.1
  const tail = text.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (tail?.[1]) {
    const v4 = parseIpv4(tail[1]);
    if (!v4) return null;
    const hex = (a: number, b: number) => ((a << 8) | b).toString(16);
    text = `${text.slice(0, -tail[1].length)}${hex(v4[0] as number, v4[1] as number)}:${hex(v4[2] as number, v4[3] as number)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0] as string);
  const rest = halves.length === 2 ? toGroups(halves[1] as string) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + rest.length > 7) return null;
  const all = [
    ...head,
    ...Array(halves.length === 2 ? 8 - head.length - rest.length : 0).fill("0"),
    ...rest,
  ];
  if (all.length !== 8) return null;
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function isPrivateIpv4(o: number[]): boolean {
  const [a = 0, b = 0] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

const v4From = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

function isPrivateIpv6(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embedded = () => isPrivateIpv4(v4From(g6, g7));
  const first96Zero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (first96Zero && g5 === 0) return true; // ::, ::1, ::a.b.c.d (IPv4-compatible)
  if (first96Zero && g5 === 0xffff) return embedded(); // ::ffff:a.b.c.d (IPv4-mapped)
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return embedded(); // NAT64 64:ff9b::/96
  }
  if (g0 === 0x2002) return isPrivateIpv4(v4From(g1, g2)); // 6to4
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo: embeds arbitrary addresses
  if (g0 === 0x2001 && g1 === 0xdb8) return true; // documentation
  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xffc0) === 0xfec0 || // site-local
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) // discard-only
  );
}

/** True for an IP literal that is not a public unicast address (or that cannot be parsed). */
export function isPrivateIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isPrivateIpv4(v4);
  const v6 = parseIpv6(ip);
  return v6 ? isPrivateIpv6(v6) : true;
}

/**
 * Whether a WHOIS referral host taken from upstream response text is safe to connect to:
 * a well-formed public hostname or public IP literal, with no port, path or userinfo.
 * This is a literal check only; the resolved address is checked again at connect time.
 */
export function isSafeWhoisReferralHost(host: string): boolean {
  const value = host.trim().replace(/\.$/, "");
  if (!value || value.length > 253) return false;

  if (parseIpv4(value) || value.includes(":")) return !isPrivateIp(value);

  const lower = value.toLowerCase();
  if (lower === "localhost" || BLOCKED_SUFFIXES.some((s) => lower.endsWith(s))) return false;
  const labels = lower.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL.test(l))) return false;
  // All-numeric last label means a malformed/obfuscated IP (e.g. 0x7f.1, 2130706433)
  return !/^\d+$/.test(labels[labels.length - 1] as string);
}
