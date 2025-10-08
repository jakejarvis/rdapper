import type { LookupOptions } from "../types";

type RdapLink = {
  value?: string;
  rel?: string;
  href?: string;
  type?: string;
};

/** Extract candidate RDAP link URLs from an RDAP document. */
export function extractRdapRelatedLinks(
  doc: unknown,
  opts?: Pick<LookupOptions, "rdapLinkRels">,
): string[] {
  const rels = (
    opts?.rdapLinkRels?.length
      ? opts.rdapLinkRels
      : ["related", "entity", "registrar", "alternate"]
  ).map((r) => r.toLowerCase());
  const d = (doc ?? {}) as Record<string, unknown> & { links?: RdapLink[] };
  const arr = Array.isArray(d?.links) ? (d.links as RdapLink[]) : [];
  const out: string[] = [];
  for (const link of arr) {
    const rel = String(link.rel || "").toLowerCase();
    const type = String(link.type || "").toLowerCase();
    if (!rels.includes(rel)) continue;
    if (type && !/application\/rdap\+json/i.test(type)) continue;
    const url = link.href || link.value;
    if (url && /^https?:\/\//i.test(url)) out.push(url);
  }
  return Array.from(new Set(out));
}
