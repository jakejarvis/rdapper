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
      dsData: [{ keyTag: 12345, algorithm: 13, digestType: 2, digest: "ABCDEF" }],
    },
    events: [
      { eventAction: "registration", eventDate: "2020-01-02T03:04:05Z" },
      { eventAction: "last changed", eventDate: "2021-01-02T03:04:05Z" },
      { eventAction: "expiration", eventDate: "2030-01-02T03:04:05Z" },
    ],
    status: ["clientTransferProhibited"],
    port43: "whois.example-registrar.test",
  };
  const rec = normalizeRdap("example.com", "com", rdap, ["https://rdap.example/"]);
  expect(rec.domain).toBe("example.com");
  expect(rec.tld).toBe("com");
  expect(rec.registrar?.name).toBe("Registrar LLC");
  expect(rec.registrar?.ianaId).toBe("9999");
  expect(rec.contacts && rec.contacts.length >= 3).toBe(true);
  expect(rec.nameservers && rec.nameservers.length === 2).toBe(true);
  expect(rec.nameservers).toBeDefined();
  expect(rec.nameservers?.[0]?.host).toBe("ns1.example.com");
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
  const rec = normalizeRdap("example.com", "com", rdap, ["https://rdap.example/"]);
  expect(rec.privacyEnabled).toBe(true);
});

test("normalizeRdap detects transfer lock with spaced status", () => {
  const rdap = {
    ldhName: "example.com",
    status: ["client transfer prohibited"],
  };
  const rec = normalizeRdap("example.com", "com", rdap, []);
  expect(rec.transferLock).toBe(true);
});

test("normalizeRdap detects transfer lock with camelCase status", () => {
  const rdap = {
    ldhName: "example.com",
    status: ["clientTransferProhibited"],
  };
  const rec = normalizeRdap("example.com", "com", rdap, []);
  expect(rec.transferLock).toBe(true);
});

test("normalizeRdap treats release-pending statuses as not registered", () => {
  const rec = normalizeRdap(
    "iba.com.br",
    "com.br",
    {
      ldhName: "iba.com.br",
      status: ["pending release"],
    },
    [],
  );
  expect(rec.isRegistered).toBe(false);
  const active = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      status: ["active"],
    },
    [],
  );
  expect(active.isRegistered).toBe(true);
});

test("normalizeRdap reads vCard adr cc parameter into countryCode", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      entities: [
        {
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [["adr", { cc: "us" }, "text", ["", "", "1 Main St", "Town", "CA", "90000", "USA"]]],
          ],
        },
      ],
    },
    [],
  );
  expect(rec.contacts?.[0]?.country).toBe("USA");
  expect(rec.contacts?.[0]?.countryCode).toBe("US");
});

test("normalizeRdap parses RFC 9537 redacted array and flags privacy", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      redacted: [
        {
          name: { description: "Registrant Email" },
          prePath: "$.entities[?(@.roles[0]=='registrant')].vcardArray[1][?(@[0]=='email')]",
          method: "emptyValue",
          reason: { description: "Server policy" },
        },
      ],
    },
    [],
  );
  expect(rec.redactions).toEqual([
    expect.objectContaining({
      name: "Registrant Email",
      method: "emptyValue",
      reason: "Server policy",
    }),
  ]);
  expect(rec.privacyEnabled).toBe(true);
});

test("normalizeRdap separates fax from tel and keeps multiple emails", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      entities: [
        {
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [
              ["tel", { type: "voice" }, "text", "+1.111"],
              ["tel", { type: ["work", "fax"] }, "text", "+1.222"],
              ["email", {}, "text", "a@example.com"],
              ["email", {}, "text", "b@example.com"],
              ["adr", {}, "text", ["", "", "Suite 5, 1 Main St", "Town", "", "", ""]],
            ],
          ],
        },
      ],
    },
    [],
  );
  const c = rec.contacts?.[0];
  expect(c?.phone).toBe("+1.111");
  expect(c?.fax).toBe("+1.222");
  expect(c?.email).toEqual(["a@example.com", "b@example.com"]);
  expect(c?.street).toEqual(["Suite 5, 1 Main St"]);
});

test("normalizeRdap prefers registration event over reregistration", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      events: [
        { eventAction: "reregistration", eventDate: "2024-01-01T00:00:00Z" },
        { eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" },
      ],
    },
    [],
  );
  expect(rec.creationDate).toBe("2020-01-01T00:00:00Z");
});

test("normalizeRdap maps registrar adr and cc", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      entities: [
        {
          roles: ["registrar"],
          vcardArray: [
            "vcard",
            [
              ["fn", {}, "text", "Registrar LLC"],
              [
                "adr",
                { cc: "CA" },
                "text",
                ["", "", "5 King St", "Toronto", "ON", "M5H", "Canada"],
              ],
            ],
          ],
        },
      ],
    },
    [],
  );
  expect(rec.registrar).toMatchObject({
    street: ["5 King St"],
    city: "Toronto",
    state: "ON",
    postalCode: "M5H",
    country: "Canada",
    countryCode: "CA",
  });
});

test("normalizeRdap flags contacts with placeholder values or matching redactions", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      redacted: [
        {
          name: { description: "Technical Email" },
          prePath: "$.entities[?(@.roles[0]=='technical')].vcardArray[1][?(@[0]=='email')][3]",
          method: "emptyValue",
        },
      ],
      entities: [
        {
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [
              ["fn", {}, "text", "Jane Doe"],
              ["email", {}, "text", "Please query the RDDS service of the Registrar of Record"],
              ["adr", {}, "text", ["", "", "", "", "", "", "Germany"]],
            ],
          ],
        },
        { roles: ["technical"], vcardArray: ["vcard", [["fn", {}, "text", "Tech Person"]]] },
        { roles: ["administrative"], vcardArray: ["vcard", [["fn", {}, "text", "Admin Person"]]] },
      ],
    },
    [],
  );
  const [registrant, tech, admin] = rec.contacts ?? [];
  expect(registrant?.email).toBeUndefined();
  expect(registrant?.redacted).toBe(true);
  expect(registrant?.countryCode).toBe("DE");
  expect(registrant?.redactedFields).toEqual(["email"]);
  expect(tech?.redacted).toBe(true);
  expect(admin?.redacted).toBeUndefined();
});

test("normalizeRdap resolves registrar countryCode from the country name", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      entities: [
        {
          roles: ["registrar"],
          vcardArray: ["vcard", [["adr", {}, "text", ["", "", "", "", "", "", "Canada"]]]],
        },
      ],
    },
    [],
  );
  expect(rec.registrar).toMatchObject({ country: "Canada", countryCode: "CA" });
});
