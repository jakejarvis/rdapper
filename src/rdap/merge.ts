import { resolveTimeoutMs, throwIfAborted, withTimeout } from "../lib/async";
import { RdapperError } from "../lib/errors";
import { resolveFetch } from "../lib/fetch";
import { type LookupContext, traced } from "../lib/trace";
import type { LookupOptions } from "../types";
import { extractRdapRelatedLinks } from "./links";

type Json = Record<string, unknown>;

/** Coerce a loosely-typed JSON field to a string ("" for null/objects/etc.). */
function str(val: unknown): string {
  return typeof val === "string" || typeof val === "number" || typeof val === "boolean"
    ? String(val)
    : "";
}

/** Merge RDAP documents with a conservative, additive strategy. */
export function mergeRdapDocs(baseDoc: unknown, others: unknown[]): unknown {
  const merged: Json = { ...(baseDoc as Json) };
  for (const doc of others) {
    const cur = (doc ?? {}) as Json;
    // status: array of strings
    merged.status = uniqStrings([...toStringArray(merged.status), ...toStringArray(cur.status)]);
    // events: array of objects; dedupe by eventAction + eventDate
    merged.events = uniqBy(
      [...toArray<Json>(merged.events), ...toArray<Json>(cur.events)],
      (e) => `${str(e?.eventAction).toLowerCase()}|${str(e?.eventDate)}`,
    );
    // nameservers: array of objects; dedupe by ldhName/unicodeName
    merged.nameservers = uniqBy(
      [...toArray<Json>(merged.nameservers), ...toArray<Json>(cur.nameservers)],
      (n) => `${str(n?.ldhName ?? n?.unicodeName).toLowerCase()}`,
    );
    // entities: array; dedupe by handle if present, else by roles+vcard hash
    merged.entities = uniqBy(
      [...toArray<Json>(merged.entities), ...toArray<Json>(cur.entities)],
      (e) =>
        `${str(e?.handle).toLowerCase()}|${String(
          JSON.stringify(e?.roles || []),
        ).toLowerCase()}|${String(JSON.stringify(e?.vcardArray || [])).toLowerCase()}`,
    );
    // secureDNS: prefer existing; fill if missing
    if (merged.secureDNS == null && cur.secureDNS != null) merged.secureDNS = cur.secureDNS;
    // port43 (authoritative WHOIS): prefer existing; fill if missing
    if (merged.port43 == null && cur.port43 != null) merged.port43 = cur.port43;
    // redacted (RFC 9537): concat, dedupe by JSON
    if (merged.redacted != null || cur.redacted != null) {
      merged.redacted = uniqBy(
        [...toArray<Json>(merged.redacted), ...toArray<Json>(cur.redacted)],
        (r) => JSON.stringify(r),
      );
    }
    // remarks: concat simple strings if present
    const mergedRemarks = (merged as { remarks?: Json[] }).remarks;
    const curRemarks = (cur as { remarks?: Json[] }).remarks;
    if (Array.isArray(mergedRemarks) || Array.isArray(curRemarks)) {
      const a = toArray<Json>(mergedRemarks);
      const b = toArray<Json>(curRemarks);
      (merged as { remarks?: Json[] }).remarks = [...a, ...b];
    }
  }
  return merged;
}

/** Fetch and merge RDAP related documents up to a hop limit. */
export async function fetchAndMergeRdapRelated(
  domain: string,
  baseDoc: unknown,
  opts?: LookupOptions,
  ctx?: LookupContext,
): Promise<{ merged: unknown; serversTried: string[] }> {
  const tried: string[] = [];
  if (opts?.rdapFollowLinks === false) return { merged: baseDoc, serversTried: tried };
  const maxHops = Math.max(0, opts?.maxRdapLinkHops ?? 2);
  if (maxHops === 0) return { merged: baseDoc, serversTried: tried };

  const visited = new Set<string>();
  let current = baseDoc;
  let hops = 0;

  // BFS: collect links from the latest merged doc only to keep it simple and bounded
  while (hops < maxHops) {
    throwIfAborted(opts?.signal);
    const links = extractRdapRelatedLinks(current, {
      rdapLinkRels: opts?.rdapLinkRels,
    });
    const nextBatch = links.filter((u) => !visited.has(u));
    if (nextBatch.length === 0) break;
    const fetchedDocs: unknown[] = [];
    for (const url of nextBatch) {
      throwIfAborted(opts?.signal);
      visited.add(url);
      try {
        const { json } = await fetchRdapUrl(url, opts, ctx);
        tried.push(url);
        // only accept docs that appear related to the same domain when possible
        // if ldhName/unicodeName present, they should match the queried domain (case-insensitive)
        const ldh = str((json as Json)?.ldhName).toLowerCase();
        const uni = str((json as Json)?.unicodeName).toLowerCase();
        if (ldh && !sameDomain(ldh, domain)) continue;
        if (uni && !sameDomain(uni, domain)) continue;
        fetchedDocs.push(json);
      } catch {
        // caller abort / deadline stops the lookup; other failures are recorded in attempts
        throwIfAborted(opts?.signal);
      }
    }
    if (fetchedDocs.length === 0) break;
    current = mergeRdapDocs(current, fetchedDocs);
    hops += 1;
  }
  return { merged: current, serversTried: tried };
}

async function fetchRdapUrl(
  url: string,
  options?: LookupOptions,
  ctx?: LookupContext,
): Promise<{ url: string; json: unknown }> {
  const fetchFn = resolveFetch(options);
  return traced(ctx, { phase: "rdap_link", server: url }, () =>
    withTimeout(
      resolveTimeoutMs(options),
      "RDAP link fetch timeout",
      options?.signal,
      async (signal) => {
        const res = await fetchFn(url, {
          method: "GET",
          headers: { accept: "application/rdap+json, application/json" },
          signal,
        });
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          throw new RdapperError("http_error", `RDAP ${res.status}: ${bodyText.slice(0, 500)}`);
        }
        const json = await res.json();
        // Optionally parse Link header for future iterations; the main loop inspects body.links
        return { url, json };
      },
    ),
  );
}

function toArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}
function toStringArray(val: unknown): string[] {
  return Array.isArray(val) ? (val as unknown[]).map((v) => String(v)) : [];
}
function uniqStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
function uniqBy<T>(arr: T[], key: (t: T) => string): T[] {
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
function sameDomain(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
