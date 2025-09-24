import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRdap } from "../normalize.js";

test("normalizeRdap maps registrar, contacts, nameservers, events, dnssec", () => {
  const rdap = {
    ldhName: "example.com",
    unicodeName: "example.com",
    entities: [
      {
        roles: ["registrar"],
        vcardArray: [
          "vcard",
          [
            ["fn", {}, "text", "Registrar LLC"],
            ["email", {}, "text", "support@registrar.test"],
            ["tel", {}, "text", "+1.5555555555"],
            ["url", {}, "text", "https://registrar.example"],
          ],
        ],
        publicIds: [{ type: "IANA Registrar ID", identifier: "9999" }],
      },
      {
        roles: ["registrant"],
        vcardArray: [
          "vcard",
          [
            ["fn", {}, "text", "Alice Registrant"],
            ["email", {}, "text", "alice@example.com"],
          ],
        ],
      },
      {
        roles: ["administrative"],
        vcardArray: ["vcard", [["fn", {}, "text", "Bob Admin"]]],
      },
      {
        roles: ["technical"],
        vcardArray: ["vcard", [["fn", {}, "text", "Carol Tech"]]],
      },
    ],
    nameservers: [
      {
        ldhName: "NS1.EXAMPLE.COM",
        ipAddresses: { v4: ["192.0.2.1"], v6: ["2001:db8::1"] },
      },
      { unicodeName: "ns2.example.com" },
    ],
    secureDNS: {
      delegationSigned: true,
      dsData: [
        { keyTag: 12345, algorithm: 13, digestType: 2, digest: "ABCDEF" },
      ],
    },
    events: [
      { eventAction: "registration", eventDate: "2020-01-02T03:04:05Z" },
      { eventAction: "last changed", eventDate: "2021-01-02T03:04:05Z" },
      { eventAction: "expiration", eventDate: "2030-01-02T03:04:05Z" },
    ],
    status: ["clientTransferProhibited"],
    port43: "whois.example-registrar.test",
  };
  const rec = normalizeRdap(
    "example.com",
    "com",
    rdap,
    ["https://rdap.example/"],
    "2025-01-01T00:00:00Z",
  );
  assert.equal(rec.domain, "example.com");
  assert.equal(rec.tld, "com");
  assert.equal(rec.registrar?.name, "Registrar LLC");
  assert.equal(rec.registrar?.ianaId, "9999");
  assert.ok(rec.contacts && rec.contacts.length >= 3);
  assert.ok(rec.nameservers && rec.nameservers.length === 2);
  assert.equal(rec.nameservers?.[0].host, "ns1.example.com");
  assert.ok(rec.dnssec?.enabled);
  assert.equal(rec.creationDate, "2020-01-02T03:04:05Z");
  assert.equal(rec.expirationDate, "2030-01-02T03:04:05Z");
  assert.equal(rec.transferLock, true);
  assert.equal(rec.whoisServer, "whois.example-registrar.test");
  assert.equal(rec.source, "rdap");
});
