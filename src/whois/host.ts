import { isIP } from "node:net";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".localdomain", ".lan", ".home"];

function isPrivateIpv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
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

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) || // unique local
    /^fe[89ab]/.test(lower) || // link-local
    lower.startsWith("ff") // multicast
  );
}

/**
 * Whether a WHOIS referral host taken from upstream response text is safe to connect to:
 * a well-formed public hostname or public IP literal, with no port, path or userinfo.
 */
export function isSafeWhoisReferralHost(host: string): boolean {
  const value = host.trim().replace(/\.$/, "");
  if (!value || value.length > 253) return false;

  const ipVersion = isIP(value);
  if (ipVersion === 4) return !isPrivateIpv4(value);
  if (ipVersion === 6) return !isPrivateIpv6(value);

  const lower = value.toLowerCase();
  if (lower === "localhost" || BLOCKED_SUFFIXES.some((s) => lower.endsWith(s))) return false;
  const labels = lower.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL.test(l))) return false;
  // All-numeric last label means a malformed/obfuscated IP (e.g. 0x7f.1, 2130706433)
  return !/^\d+$/.test(labels[labels.length - 1] as string);
}
