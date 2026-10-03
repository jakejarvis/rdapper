import { describe, expect, it, vi } from "vitest";
import { fetchAndMergeRdapRelated } from "./merge";

/** A customFetch serving fixed JSON documents by URL. */
function serve(docs: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const doc = docs[typeof url === "string" ? url : url instanceof URL ? url.href : url.url];
    return doc
      ? new Response(JSON.stringify(doc), { status: 200 })
      : new Response("not found", { status: 404 });
  });
}

const related = (href: string) => ({
  rel: "related",
  type: "application/rdap+json",
  href,
});

describe("fetchAndMergeRdapRelated", () => {
  it("merges an IDN registrar doc whose unicodeName matches the punycode query", async () => {
    const base = {
      objectClassName: "domain",
      ldhName: "XN--MNCHEN-3YA.COM",
      links: [related("https://rdap.registrar.test/domain/xn--mnchen-3ya.com")],
    };
    const customFetch = serve({
      "https://rdap.registrar.test/domain/xn--mnchen-3ya.com": {
        objectClassName: "domain",
        ldhName: "xn--mnchen-3ya.com",
        unicodeName: "münchen.com",
        entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "X"]]] }],
      },
    });
    const { merged } = await fetchAndMergeRdapRelated("xn--mnchen-3ya.com", base, { customFetch });
    expect((merged as { entities?: unknown[] }).entities).toHaveLength(1);
  });

  it("does not merge a linked entity document into the domain", async () => {
    const base = {
      objectClassName: "domain",
      ldhName: "example.com",
      status: ["client transfer prohibited"],
      links: [{ rel: "entity", type: "application/rdap+json", href: "https://rdap.test/entity/1" }],
    };
    const customFetch = serve({
      "https://rdap.test/entity/1": {
        objectClassName: "entity",
        handle: "1",
        status: ["active"],
        events: [{ eventAction: "last changed", eventDate: "2010-01-01T00:00:00Z" }],
      },
    });
    const { merged } = await fetchAndMergeRdapRelated("example.com", base, { customFetch });
    expect(merged).toMatchObject({ status: ["client transfer prohibited"] });
    expect((merged as { events?: unknown[] }).events ?? []).toHaveLength(0);
  });

  it("does not merge a document for another domain", async () => {
    const base = { ldhName: "example.com", links: [related("https://rdap.test/domain/other.com")] };
    const customFetch = serve({
      "https://rdap.test/domain/other.com": {
        objectClassName: "domain",
        ldhName: "other.com",
        status: ["active"],
      },
    });
    const { merged } = await fetchAndMergeRdapRelated("example.com", base, { customFetch });
    expect((merged as { status?: unknown }).status).toBeUndefined();
  });
});
