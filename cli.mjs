#!/usr/bin/env node

// Quick informal test runner for rdapper
// Usage:
//   npm run build && node dev.mjs example.com
// Env:
//   RDAP_ONLY=1 | WHOIS_ONLY=1 | TIMEOUT_MS=15000 | FOLLOW_REFERRAL=0

import { lookupDomain } from "./dist/index.js";

const domain = process.argv[2] ?? "example.com";

const options = {
  timeoutMs: process.env.TIMEOUT_MS ? Number(process.env.TIMEOUT_MS) : 15000,
  followWhoisReferral: process.env.FOLLOW_REFERRAL !== "0",
  rdapOnly: process.env.RDAP_ONLY === "1",
  whoisOnly: process.env.WHOIS_ONLY === "1",
};

const result = await lookupDomain(domain, options);

if (!result.ok) {
  console.error("Error:", result.error);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result.record, null, 2));
}
