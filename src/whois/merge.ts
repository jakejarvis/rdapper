import { uniq } from "../lib/text";
import type { Contact, DomainRecord, Nameserver } from "../types";

function dedupeStatuses(
  a?: DomainRecord["statuses"],
  b?: DomainRecord["statuses"],
) {
  const list = [...(a || []), ...(b || [])];
  const seen = new Set<string>();
  const out: NonNullable<DomainRecord["statuses"]> = [];
  for (const s of list) {
    const key = (s?.status || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.length ? out : undefined;
}

function dedupeNameservers(a?: Nameserver[], b?: Nameserver[]) {
  const map = new Map<string, Nameserver>();
  for (const ns of [...(a || []), ...(b || [])]) {
    const host = ns.host.toLowerCase();
    const prev = map.get(host);
    if (!prev) {
      map.set(host, { ...ns, host });
      continue;
    }
    const ipv4 = uniq([...(prev.ipv4 || []), ...(ns.ipv4 || [])]);
    const ipv6 = uniq([...(prev.ipv6 || []), ...(ns.ipv6 || [])]);
    map.set(host, { host, ipv4, ipv6 });
  }
  const out = Array.from(map.values());
  return out.length ? out : undefined;
}

function dedupeContacts(a?: Contact[], b?: Contact[]) {
  const list = [...(a || []), ...(b || [])];
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const c of list) {
    const key = `${c.type}|${(c.organization || c.name || c.email || "").toString().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.length ? out : undefined;
}

/** Conservative merge: start with base; fill missing scalars; union arrays; prefer more informative dates. */
export function mergeWhoisRecords(
  base: DomainRecord,
  others: DomainRecord[],
): DomainRecord {
  const merged: DomainRecord = { ...base };
  for (const cur of others) {
    merged.isRegistered = merged.isRegistered || cur.isRegistered;
    merged.registry = merged.registry ?? cur.registry;
    merged.registrar = merged.registrar ?? cur.registrar;
    merged.reseller = merged.reseller ?? cur.reseller;
    merged.statuses = dedupeStatuses(merged.statuses, cur.statuses);
    // Dates: prefer earliest creation, latest updated/expiration when available
    merged.creationDate = preferEarliestIso(
      merged.creationDate,
      cur.creationDate,
    );
    merged.updatedDate = preferLatestIso(merged.updatedDate, cur.updatedDate);
    merged.expirationDate = preferLatestIso(
      merged.expirationDate,
      cur.expirationDate,
    );
    merged.deletionDate = merged.deletionDate ?? cur.deletionDate;
    merged.transferLock = Boolean(merged.transferLock || cur.transferLock);
    merged.dnssec = merged.dnssec ?? cur.dnssec;
    merged.nameservers = dedupeNameservers(merged.nameservers, cur.nameservers);
    merged.contacts = dedupeContacts(merged.contacts, cur.contacts);
    merged.privacyEnabled = merged.privacyEnabled ?? cur.privacyEnabled;
    // Keep whoisServer pointing to the latest contributing authoritative server
    merged.whoisServer = cur.whoisServer ?? merged.whoisServer;
    // rawWhois: keep last contributing text
    merged.rawWhois = cur.rawWhois ?? merged.rawWhois;
  }
  return merged;
}

function preferEarliestIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

function preferLatestIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}
