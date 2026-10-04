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

  it("follows links found in fetched documents, up to maxRdapLinkHops fetches in all", async () => {
    const domainDoc = (status: string, links: unknown[] = []) => ({
      objectClassName: "domain",
      ldhName: "example.com",
      status: [status],
      links,
    });
    const base = domainDoc("server hold", [
      related("https://a.test/d"),
      related("https://b.test/d"),
    ]);
    const customFetch = serve({
      "https://a.test/d": domainDoc("client hold", [related("https://c.test/d")]),
      "https://b.test/d": domainDoc("inactive"),
      "https://c.test/d": domainDoc("pending delete"),
    });
    const three = await fetchAndMergeRdapRelated("example.com", base, {
      customFetch,
      maxRdapLinkHops: 3,
    });
    expect(three.serversTried).toEqual([
      "https://a.test/d",
      "https://b.test/d",
      "https://c.test/d",
    ]);
    expect((three.merged as { status: string[] }).status).toContain("pending delete");
    customFetch.mockClear();
    const two = await fetchAndMergeRdapRelated("example.com", base, { customFetch });
    expect(customFetch).toHaveBeenCalledTimes(2);
    expect(two.serversTried).toEqual(["https://a.test/d", "https://b.test/d"]);
  });

  it("skips malformed links, self links, and links without an href", async () => {
    const base = {
      ldhName: "example.com",
      links: [
        null,
        { rel: "self", href: "https://rdap.test/domain/example.com" },
        related("https://rdap.test/domain/example.com"),
        {
          rel: "related",
          type: "application/rdap+json",
          value: "https://rdap.test/domain/example.com",
        },
      ],
    };
    const customFetch = serve({});
    const { serversTried } = await fetchAndMergeRdapRelated("example.com", base, { customFetch });
    expect(customFetch).not.toHaveBeenCalled();
    expect(serversTried).toEqual([]);
  });

  it("doesn't follow links to private, local, or credentialed hosts", async () => {
    const base = {
      ldhName: "example.com",
      links: [
        related("http://169.254.169.254/latest/meta-data/"),
        related("http://127.1/domain/example.com"),
        related("http://[::1]:8080/domain/example.com"),
        related("https://localhost/domain/example.com"),
        related("https://rdap.internal/domain/example.com"),
        related("https://user:pass@rdap.registrar.test/domain/example.com"),
        related("ftp://rdap.registrar.test/domain/example.com"),
        related("https://rdap.registrar.test:8443/domain/example.com"),
      ],
    };
    const customFetch = serve({});
    const { serversTried } = await fetchAndMergeRdapRelated("example.com", base, {
      customFetch,
      maxRdapLinkHops: 10,
    });
    // Only the public host is fetched (a port is fine)
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(customFetch.mock.calls[0]?.[0]).toBe(
      "https://rdap.registrar.test:8443/domain/example.com",
    );
    expect(serversTried).toEqual([]);
  });
});
