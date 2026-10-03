import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.js", () => ({
  whoisQuery: vi.fn(async (server: string) => ({
    serverQueried: server,
    text: "domain:       COM\nwhois:        whois.verisign-grs.com\n",
  })),
}));

import { whoisQuery } from "./client";
import { discoverWhoisServer } from "./discovery";

describe("discoverWhoisServer for sub-registry suffixes", () => {
  beforeEach(() => {
    vi.mocked(whoisQuery).mockClear();
  });

  it("uses the operator's server without asking IANA", async () => {
    expect(await discoverWhoisServer("uk.com")).toEqual({ server: "whois.centralnic.com" });
    expect(whoisQuery).not.toHaveBeenCalled();
  });

  it("still lets whoisHints override it", async () => {
    const res = await discoverWhoisServer("uk.com", { whoisHints: { "uk.com": "whois.example" } });
    expect(res).toEqual({ server: "whois.example" });
  });

  it("asks IANA for ordinary TLDs", async () => {
    expect((await discoverWhoisServer("com")).server).toBe("whois.verisign-grs.com");
    expect(whoisQuery).toHaveBeenCalledWith("whois.iana.org", "com", undefined);
  });
});
