import { mergeContacts } from "../lib/contacts";
import { mergeNameservers } from "../lib/nameservers";
import type { DomainRecord } from "../types";

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

/** Conservative merge: start with the registry's record (base); fill missing scalars and dates; union arrays. */
export function mergeWhoisRecords(base: DomainRecord, others: DomainRecord[]): DomainRecord {
  const merged: DomainRecord = { ...base };
  for (const cur of others) {
    merged.isRegistered = merged.isRegistered || cur.isRegistered;
    merged.registry = merged.registry ?? cur.registry;
    merged.registrar = merged.registrar ?? cur.registrar;
    merged.reseller = merged.reseller ?? cur.reseller;
    merged.statuses = dedupeStatuses(merged.statuses, cur.statuses);
    // Dates: the registry's (the base record's) are authoritative, as in RDAP; a registrar's
    // reply only fills in what the registry lacks. Its own "Updated Date" tracks its records, and
    // some registrars print local times without a zone.
    merged.creationDate = merged.creationDate ?? cur.creationDate;
    merged.updatedDate = merged.updatedDate ?? cur.updatedDate;
    merged.expirationDate = merged.expirationDate ?? cur.expirationDate;
    merged.deletionDate = merged.deletionDate ?? cur.deletionDate;
    merged.transferLock = Boolean(merged.transferLock || cur.transferLock);
    merged.dnssec = merged.dnssec ?? cur.dnssec;
    merged.nameservers = mergeNameservers(merged.nameservers, cur.nameservers);
    merged.contacts = mergeContacts([...(merged.contacts ?? []), ...(cur.contacts ?? [])]);
    merged.privacyEnabled = merged.privacyEnabled ?? cur.privacyEnabled;
    // Keep whoisServer pointing to the latest contributing authoritative server
    merged.whoisServer = cur.whoisServer ?? merged.whoisServer;
    // rawWhois: keep last contributing text
    merged.rawWhois = cur.rawWhois ?? merged.rawWhois;
  }
  return merged;
}
