import { expect, test } from "vitest";
import { normalizeRdap } from "./normalize";

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
  const rec = normalizeRdap("example.com", "com", rdap, [
    "https://rdap.example/",
  ]);
  expect(rec.domain).toBe("example.com");
  expect(rec.tld).toBe("com");
  expect(rec.registrar?.name).toBe("Registrar LLC");
  expect(rec.registrar?.ianaId).toBe("9999");
  expect(rec.contacts && rec.contacts.length >= 3).toBe(true);
  expect(rec.nameservers && rec.nameservers.length === 2).toBe(true);
  expect(rec.nameservers?.[0].host).toBe("ns1.example.com");
  expect(rec.dnssec?.enabled).toBeTruthy();
  expect(rec.creationDate).toBe("2020-01-02T03:04:05Z");
  expect(rec.expirationDate).toBe("2030-01-02T03:04:05Z");
  expect(rec.transferLock).toBe(true);
  expect(rec.whoisServer).toBe("whois.example-registrar.test");
  expect(rec.source).toBe("rdap");
});

test("normalizeRdap derives privacyEnabled from registrant keywords", () => {
  const rdap = {
    ldhName: "example.com",
    unicodeName: "example.com",
    entities: [
      {
        roles: ["registrant"],
        vcardArray: [
          "vcard",
          [
            ["fn", {}, "text", "REDACTED FOR PRIVACY"],
            ["org", {}, "text", "Example Org"],
          ],
        ],
      },
    ],
  };
  const rec = normalizeRdap("example.com", "com", rdap, [
    "https://rdap.example/",
  ]);
  expect(rec.privacyEnabled).toBe(true);
});
