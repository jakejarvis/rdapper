import type { LookupOptions } from "../types";
import { isSafePublicHost } from "../whois/host";

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
 * Whether a link taken from a server's response may be followed: http(s) to a public host, with
 * no credentials. A literal check, as for WHOIS referrals: a hostname that resolves to a private
 * address, or a redirect to one, is only caught by a guarded `customFetch`.
 */
function isFollowableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  // IPv6 literals come bracketed ("[::1]")
  return isSafePublicHost(parsed.hostname.replace(/^\[(.*)\]$/, "$1"));
}

/**
 * Extract candidate RDAP link URLs from an RDAP document, "related" links (to the registrar's
 * copy of the domain) first. A link's target is its href; its value is the context, the
 * document itself. Links to private or local hosts are dropped (see {@link isFollowableUrl}).
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
    if (typeof url !== "string" || self.has(url) || !isFollowableUrl(url)) continue;
    out.push({ url, related: rel === "related" });
  }
  out.sort((a, b) => Number(b.related) - Number(a.related));
  return Array.from(new Set(out.map((l) => l.url)));
}
