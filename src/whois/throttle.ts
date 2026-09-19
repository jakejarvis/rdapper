import type { DomainRecord } from "../types";
import { isAvailableByWhois } from "./normalize";

// Real WHOIS records are much longer; refusal notices and error pages are short.
const MAX_REFUSAL_TEXT_LENGTH = 2048;

// Transient: the same query may succeed later.
const THROTTLE_PATTERNS: RegExp[] = [
  /rate[\s-]?limit/i,
  /limit\s+exceeded/i,
  /quota\s+exceeded/i,
  /exceeded\s+.{0,40}(quer|limit|request|connection)/i,
  /too\s+many\s+(quer|request|connection)/i,
  /^\s*<(!doctype|html)\b/i,
];

// Permanent: this client is refused outright, so retrying will not help.
const BLOCK_PATTERNS: RegExp[] = [
  /requests\s+of\s+this\s+client\s+are\s+not\s+permitted/i, // .ch/.li
  /\b(your|this)\s+(ip|address|client)\b[\s\S]{0,60}\b(blocked|banned|blacklisted|not\s+permitted)\b/i,
];

/**
 * Classify a short WHOIS reply that is a refusal rather than a record: `rate_limited` for a
 * transient throttle, `blocked` for a permanent block. Availability notices win, and long
 * responses are never refusals, so a real record that mentions "rate limit" is not rejected.
 */
export function detectWhoisRefusal(
  text: string | undefined,
): "rate_limited" | "blocked" | undefined {
  if (!text || text.length > MAX_REFUSAL_TEXT_LENGTH) return undefined;
  if (isAvailableByWhois(text)) return undefined;
  if (BLOCK_PATTERNS.some((re) => re.test(text))) return "blocked";
  if (THROTTLE_PATTERNS.some((re) => re.test(text))) return "rate_limited";
  return undefined;
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
