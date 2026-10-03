import type { Nameserver } from "../types";
import { uniq } from "./text";

/**
 * Combine nameserver lists, one entry per host (lowercase, without a trailing dot) with the
 * union of its glue addresses. Undefined when there are none.
 */
export function mergeNameservers(
  ...lists: Array<Nameserver[] | undefined>
): Nameserver[] | undefined {
  const byHost = new Map<string, Nameserver>();
  for (const ns of lists.flatMap((l) => l ?? [])) {
    const host = ns.host.toLowerCase().replace(/\.$/, "");
    if (!host) continue;
    const prev = byHost.get(host);
    const ipv4 = uniq([...(prev?.ipv4 ?? []), ...(ns.ipv4 ?? [])]) ?? [];
    const ipv6 = uniq([...(prev?.ipv6 ?? []), ...(ns.ipv6 ?? [])]) ?? [];
    const merged: Nameserver = { host };
    if (ipv4.length) merged.ipv4 = ipv4;
    if (ipv6.length) merged.ipv6 = ipv6;
    byHost.set(host, merged);
  }
  return byHost.size ? Array.from(byHost.values()) : undefined;
}
