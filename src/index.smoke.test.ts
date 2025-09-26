/** biome-ignore-all lint/style/noNonNullAssertion: this is fine for tests */

import { expect, test } from "vitest";
import { isAvailable, isRegistered, lookupDomain } from "./index.js";

// Run only when SMOKE=1 to avoid flakiness and network in CI by default
const shouldRun = process.env.SMOKE === "1";

// Basic sanity: either RDAP or WHOIS should succeed for example.com
(shouldRun ? test : test.skip)(
  "lookupDomain smoke test (example.com)",
  async () => {
    const res = await lookupDomain("example.com", {
      timeoutMs: 12000,
      followWhoisReferral: true,
    });
    expect(res.ok, res.error).toBe(true);
    expect(Boolean(res.record?.domain)).toBe(true);
    expect(Boolean(res.record?.tld)).toBe(true);
    expect(
      res.record?.source === "rdap" || res.record?.source === "whois",
    ).toBe(true);
  },
);

// RDAP-only smoke for reserved example domains (.com/.net/.org)
const rdapCases: Array<{ domain: string; tld: string; expectDs?: boolean }> = [
  { domain: "example.com", tld: "com", expectDs: true },
  { domain: "example.net", tld: "net", expectDs: true },
  { domain: "example.org", tld: "org" },
];

for (const c of rdapCases) {
  (shouldRun ? test : test.skip)(
    `RDAP-only lookup for ${c.domain}`,
    async () => {
      const res = await lookupDomain(c.domain, {
        timeoutMs: 15000,
        rdapOnly: true,
      });
      expect(res.ok, res.error).toBe(true);
      const rec = res.record!;
      expect(rec.tld).toBe(c.tld);
      expect(rec.source).toBe("rdap");
      // Registrar ID is IANA (376) for example domains
      expect(rec.registrar?.ianaId).toBe("376");
      if (c.tld !== "org") {
        // .com/.net often include the IANA reserved name explicitly
        expect(
          (rec.registrar?.name || "")
            .toLowerCase()
            .includes("internet assigned numbers authority"),
        ).toBe(true);
      }
      // IANA nameservers
      const ns = (rec.nameservers || []).map((n) => n.host.toLowerCase());
      expect(ns.includes("a.iana-servers.net")).toBe(true);
      expect(ns.includes("b.iana-servers.net")).toBe(true);
      if (c.expectDs) {
        // DS records typically present for .com/.net
        expect(rec.dnssec?.enabled).toBe(true);
        expect((rec.dnssec?.dsRecords || []).length > 0).toBe(true);
      }
    },
  );
}

// RDAP-only negative: .io lacks RDAP; expect failure
(shouldRun ? test : test.skip)(
  "RDAP-only lookup for example.io fails",
  async () => {
    const res = await lookupDomain("example.io", {
      timeoutMs: 15000,
      rdapOnly: true,
    });
    expect(res.ok).toBe(false);
  },
);

// WHOIS-only smoke for example.com
(shouldRun ? test : test.skip)(
  "WHOIS-only lookup for example.com",
  async () => {
    const res = await lookupDomain("example.com", {
      timeoutMs: 15000,
      whoisOnly: true,
      followWhoisReferral: true,
    });
    expect(res.ok, res.error).toBe(true);
    expect(res.record?.tld).toBe("com");
    expect(res.record?.source).toBe("whois");
    // Invariants for example.com
    expect(res.record?.whoisServer?.toLowerCase()).toBe(
      "whois.verisign-grs.com",
    );
    expect(res.record?.registrar?.ianaId).toBe("376");
    const ns = (res.record?.nameservers || []).map((n) => n.host.toLowerCase());
    expect(ns.includes("a.iana-servers.net")).toBe(true);
    expect(ns.includes("b.iana-servers.net")).toBe(true);
  },
);

// WHOIS-only smoke for example.io (RDAP-incompatible TLD)
(shouldRun ? test : test.skip)("WHOIS-only lookup for example.io", async () => {
  const res = await lookupDomain("example.io", {
    timeoutMs: 15000,
    whoisOnly: true,
    followWhoisReferral: true,
  });
  expect(res.ok, res.error).toBe(true);
  const rec = res.record!;
  expect(rec.tld).toBe("io");
  expect(rec.source).toBe("whois");
  // Accept either TLD WHOIS or registrar WHOIS as the final server
  const server = (rec.whoisServer || "").toLowerCase();
  expect(["whois.nic.io", "whois.namecheap.com"].includes(server)).toBe(true);
  // Registrar ID may only be present on registrar WHOIS responses
  if (rec.registrar?.ianaId) {
    expect(rec.registrar.ianaId).toBe("1068");
  }
  // Nameservers commonly set for example.io (DigitalOcean)
  const ns = (rec.nameservers || []).map((n) => n.host.toLowerCase());
  expect(ns.includes("ns1.digitalocean.com")).toBe(true);
  expect(ns.includes("ns2.digitalocean.com")).toBe(true);
  expect(ns.includes("ns3.digitalocean.com")).toBe(true);
});

(shouldRun ? test : test.skip)(
  "isRegistered true for example.com",
  async () => {
    await expect(
      isRegistered("example.com", { timeoutMs: 15000 }),
    ).resolves.toBe(true);
  },
);

(shouldRun ? test : test.skip)(
  "isAvailable true for an unlikely .com",
  async () => {
    const unlikely = `nonexistent-${Date.now()}-smoke-example.com`;
    await expect(isAvailable(unlikely, { timeoutMs: 15000 })).resolves.toBe(
      true,
    );
  },
);
