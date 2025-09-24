import assert from "node:assert/strict";
import test from "node:test";
import { lookupDomain } from "./lookup.js";

// Run only when SMOKE=1 to avoid flakiness and network in CI by default
const shouldRun = process.env.SMOKE === "1";

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
