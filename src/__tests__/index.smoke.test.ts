/** biome-ignore-all lint/style/noNonNullAssertion: this is fine for tests */

import assert from "node:assert/strict";
import test from "node:test";
import { isAvailable, isRegistered, lookupDomain } from "../index.js";

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
    assert.equal(res.ok, true, res.error);
    assert.ok(res.record?.domain);
    assert.ok(res.record?.tld);
    assert.ok(res.record?.source === "rdap" || res.record?.source === "whois");
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
      assert.equal(res.ok, true, res.error);
      const rec = res.record!;
      assert.equal(rec.tld, c.tld);
      assert.equal(rec.source, "rdap");
      // Registrar ID is IANA (376) for example domains
      assert.equal(rec.registrar?.ianaId, "376");
      if (c.tld !== "org") {
        // .com/.net often include the IANA reserved name explicitly
        assert.ok(
          (rec.registrar?.name || "")
            .toLowerCase()
            .includes("internet assigned numbers authority"),
        );
      }
      // IANA nameservers
      const ns = (rec.nameservers || []).map((n) => n.host.toLowerCase());
      assert.ok(ns.includes("a.iana-servers.net"));
      assert.ok(ns.includes("b.iana-servers.net"));
      if (c.expectDs) {
        // DS records typically present for .com/.net
        assert.equal(rec.dnssec?.enabled, true);
        assert.ok((rec.dnssec?.dsRecords || []).length > 0);
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
    assert.equal(res.ok, false);
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
    assert.equal(res.ok, true, res.error);
    assert.equal(res.record?.tld, "com");
    assert.equal(res.record?.source, "whois");
    // Invariants for example.com
    assert.equal(
      res.record?.whoisServer?.toLowerCase(),
      "whois.verisign-grs.com",
    );
    assert.equal(res.record?.registrar?.ianaId, "376");
    const ns = (res.record?.nameservers || []).map((n) => n.host.toLowerCase());
    assert.ok(ns.includes("a.iana-servers.net"));
    assert.ok(ns.includes("b.iana-servers.net"));
  },
);

// WHOIS-only smoke for example.io (RDAP-incompatible TLD)
(shouldRun ? test : test.skip)("WHOIS-only lookup for example.io", async () => {
  const res = await lookupDomain("example.io", {
    timeoutMs: 15000,
    whoisOnly: true,
    followWhoisReferral: true,
  });
  assert.equal(res.ok, true, res.error);
  const rec = res.record!;
  assert.equal(rec.tld, "io");
  assert.equal(rec.source, "whois");
  // Accept either TLD WHOIS or registrar WHOIS as the final server
  const server = (rec.whoisServer || "").toLowerCase();
  assert.ok(["whois.nic.io", "whois.namecheap.com"].includes(server));
  // Registrar ID may only be present on registrar WHOIS responses
  if (rec.registrar?.ianaId) {
    assert.equal(rec.registrar.ianaId, "1068");
  }
  // Nameservers commonly set for example.io (DigitalOcean)
  const ns = (rec.nameservers || []).map((n) => n.host.toLowerCase());
  assert.ok(ns.includes("ns1.digitalocean.com"));
  assert.ok(ns.includes("ns2.digitalocean.com"));
  assert.ok(ns.includes("ns3.digitalocean.com"));
});

(shouldRun ? test : test.skip)(
  "isRegistered true for example.com",
  async () => {
    assert.equal(await isRegistered("example.com", { timeoutMs: 15000 }), true);
  },
);

(shouldRun ? test : test.skip)(
  "isAvailable true for an unlikely .com",
  async () => {
    const unlikely = `nonexistent-${Date.now()}-smoke-example.com`;
    assert.equal(await isAvailable(unlikely, { timeoutMs: 15000 }), true);
  },
);
