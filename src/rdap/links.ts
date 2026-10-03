import type { LookupOptions } from "../types";

type RdapLink = {
  value?: string;
  rel?: string;
  href?: string;
  type?: string;
};

function linksOf(doc: unknown): RdapLink[] {
  const links = (doc as { links?: unknown } | null)?.links;
  return Array.isArray(links)
    ? links.filter((l): l is RdapLink => !!l && typeof l === "object")
    : [];
}

/** The document's own URLs, from its "self" links. */
export function selfLinks(doc: unknown): string[] {
  return linksOf(doc)
    .filter((l) => String(l.rel).toLowerCase() === "self" && typeof l.href === "string")
    .map((l) => l.href as string);
}

/**
 * Extract candidate RDAP link URLs from an RDAP document, "related" links (to the registrar's
 * copy of the domain) first. A link's target is its href; its value is the context, the
 * document itself.
 */
export function extractRdapRelatedLinks(
  doc: unknown,
  opts?: Pick<LookupOptions, "rdapLinkRels">,
): string[] {
  const rels = (
    opts?.rdapLinkRels?.length ? opts.rdapLinkRels : ["related", "entity", "registrar", "alternate"]
  ).map((r) => r.toLowerCase());
  const self = new Set(selfLinks(doc));
  const out: Array<{ url: string; related: boolean }> = [];
  for (const link of linksOf(doc)) {
    const rel = String(link.rel || "").toLowerCase();
    const type = String(link.type || "").toLowerCase();
    if (!rels.includes(rel)) continue;
    if (type && !/application\/rdap\+json/i.test(type)) continue;
    const url = link.href;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || self.has(url)) continue;
    out.push({ url, related: rel === "related" });
  }
  out.sort((a, b) => Number(b.related) - Number(a.related));
  return Array.from(new Set(out.map((l) => l.url)));
}
