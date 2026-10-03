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
    // Nominet's whois.nic.uk answers ac.uk names with the ac.uk delegation itself
    expect(await discoverWhoisServer("ac.uk")).toEqual({ server: "whois.ja.net" });
    expect(whoisQuery).not.toHaveBeenCalled();
    // nhs.uk's operator publishes no WHOIS, and IANA would name Nominet's
    expect(await discoverWhoisServer("nhs.uk")).toEqual({});
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

describe("discoverWhoisServer for multi-label public suffixes", () => {
  beforeEach(() => {
    vi.mocked(whoisQuery).mockClear();
  });

  it("asks IANA about the TLD, not the suffix", async () => {
    vi.mocked(whoisQuery).mockResolvedValueOnce({
      serverQueried: "whois.iana.org",
      text: "domain:       UK\nwhois:        whois.nic.uk\n",
    });
    expect((await discoverWhoisServer("co.uk")).server).toBe("whois.nic.uk");
    expect(whoisQuery).toHaveBeenCalledWith("whois.iana.org", "uk", undefined);
  });

  it("applies a hint or exception keyed by the TLD", async () => {
    expect(await discoverWhoisServer("co.uk", { whoisHints: { uk: "whois.custom" } })).toEqual({
      server: "whois.custom",
    });
    vi.mocked(whoisQuery).mockRejectedValueOnce(new Error("IANA down"));
    expect((await discoverWhoisServer("com.br")).server).toBe("whois.registro.br");
  });
});
