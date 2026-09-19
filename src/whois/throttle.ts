import type { DomainRecord } from "../types";

// Real WHOIS records are much longer; throttle notices and error pages are short.
const MAX_THROTTLE_TEXT_LENGTH = 2048;

const THROTTLE_PATTERNS: RegExp[] = [
  /rate[\s-]?limit/i,
  /limit\s+exceeded/i,
  /quota\s+exceeded/i,
  /exceeded\s+.{0,40}(quer|limit|request|connection)/i,
  /too\s+many\s+(quer|request|connection)/i,
  /try\s+again\s+(later|in)/i,
  /access\s+(denied|limit)/i,
  /\b(blocked|blacklisted|banned)\b/i,
  /^\s*<(!doctype|html)\b/i,
];

/**
 * Heuristic: does this WHOIS response look like a throttle notice or error page rather than
 * a domain record? Only short responses qualify, so a real record that mentions "rate limit"
 * in a remark is not rejected.
 */
export function detectWhoisThrottle(text: string | undefined): boolean {
  if (!text) return false;
  if (text.length > MAX_THROTTLE_TEXT_LENGTH) return false;
  return THROTTLE_PATTERNS.some((re) => re.test(text));
}

/** True when a normalized WHOIS record carries none of the fields a real registration would. */
export function looksEmptyWhois(record: DomainRecord): boolean {
  return !(
    record.registrar ||
    record.creationDate ||
    record.updatedDate ||
    record.expirationDate ||
    record.nameservers?.length ||
    record.statuses?.length ||
    record.contacts?.length
  );
}
