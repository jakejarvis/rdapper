import { mergeNameservers } from "../lib/nameservers";
import type { Contact, DomainRecord } from "../types";

function dedupeStatuses(a?: DomainRecord["statuses"], b?: DomainRecord["statuses"]) {
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
export function mergeWhoisRecords(base: DomainRecord, others: DomainRecord[]): DomainRecord {
  const merged: DomainRecord = { ...base };
  for (const cur of others) {
    merged.isRegistered = merged.isRegistered || cur.isRegistered;
    merged.registry = merged.registry ?? cur.registry;
    merged.registrar = merged.registrar ?? cur.registrar;
    merged.reseller = merged.reseller ?? cur.reseller;
    merged.statuses = dedupeStatuses(merged.statuses, cur.statuses);
    // Dates: prefer earliest creation, latest updated/expiration when available
    merged.creationDate = preferEarliestIso(merged.creationDate, cur.creationDate);
    merged.updatedDate = preferLatestIso(merged.updatedDate, cur.updatedDate);
    merged.expirationDate = preferLatestIso(merged.expirationDate, cur.expirationDate);
    merged.deletionDate = merged.deletionDate ?? cur.deletionDate;
    merged.transferLock = Boolean(merged.transferLock || cur.transferLock);
    merged.dnssec = merged.dnssec ?? cur.dnssec;
    merged.nameservers = mergeNameservers(merged.nameservers, cur.nameservers);
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
