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

test("normalizeRdap ties a redaction path to redactedFields", () => {
  const entity = {
    roles: ["registrant"],
    vcardArray: ["vcard", [["fn", {}, "text", "Jane Doe"]]],
  };
  const emailOnly = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      redacted: [
        {
          name: { description: "Registrant Email" },
          prePath: "$.entities[?(@.roles[0]=='registrant')].vcardArray[1][?(@[0]=='email')][3]",
          method: "emptyValue",
        },
      ],
      entities: [entity],
    },
    [],
  );
  expect(emailOnly.contacts?.[0]?.redactedFields).toEqual(["email"]);
  expect(emailOnly.contacts?.[0]?.redacted).toBe(true);
});

test("normalizeRdap takes registrar email/phone from the nested abuse entity (gTLD profile)", () => {
  // Shape of Verisign's registrar entity for google.com
  const rec = normalizeRdap(
    "google.com",
    "com",
    {
      ldhName: "GOOGLE.COM",
      entities: [
        {
          roles: ["registrar"],
          handle: "292",
          publicIds: [{ type: "IANA Registrar ID", identifier: "292" }],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "MarkMonitor Inc."],
            ],
          ],
          entities: [
            {
              roles: ["abuse"],
              vcardArray: [
                "vcard",
                [
                  ["version", {}, "text", "4.0"],
                  ["fn", {}, "text", ""],
                  ["tel", { type: "voice" }, "uri", "tel:+1.2086851750"],
                  ["email", {}, "text", "abusecomplaints@markmonitor.com"],
                ],
              ],
            },
          ],
        },
      ],
    },
    [],
  );
  expect(rec.registrar).toMatchObject({
    name: "MarkMonitor Inc.",
    ianaId: "292",
    email: "abusecomplaints@markmonitor.com",
    phone: "+1.2086851750",
  });
  // The nested abuse entity belongs to the registrar, not the domain's own contacts
  expect(rec.contacts).toBeUndefined();
});

test("normalizeRdap prefers the registrar's own email over its abuse contact", () => {
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
              ["email", {}, "text", "support@registrar.test"],
            ],
          ],
          entities: [
            {
              roles: ["abuse"],
              vcardArray: [
                "vcard",
                [
                  ["email", {}, "text", "abuse@registrar.test"],
                  ["tel", {}, "text", "+1.5555550100"],
                ],
              ],
            },
          ],
        },
      ],
    },
    [],
  );
  expect(rec.registrar?.email).toBe("support@registrar.test");
  expect(rec.registrar?.phone).toBe("+1.5555550100");
});

test("normalizeRdap reports EPP status codes and keeps the RDAP spelling in raw", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      // A merged registry + registrar document can repeat a status in another spelling
      status: ["client transfer prohibited", "active", "clientTransferProhibited", "locked"],
    },
    [],
  );
  expect(rec.statuses).toEqual([
    { status: "clientTransferProhibited", raw: "client transfer prohibited" },
    { status: "ok", raw: "active" },
    { status: "locked", raw: "locked" },
  ]);
});

test("normalizeRdap sets reseller from the reseller entity (SIDN, .nl)", () => {
  const rec = normalizeRdap(
    "nu.nl",
    "nl",
    {
      ldhName: "nu.nl",
      entities: [
        {
          roles: ["registrar"],
          handle: "0000",
          vcardArray: ["vcard", [["fn", {}, "text", "Registrar.eu"]]],
        },
        {
          roles: ["reseller"],
          handle: "REDACTED-BY-SIDN",
          vcardArray: ["vcard", [["fn", {}, "text", "DPG Media Group nv"]]],
        },
      ],
    },
    [],
  );
  expect(rec.reseller).toBe("DPG Media Group nv");
  expect(rec.contacts?.find((c) => c.type === "reseller")?.name).toBe("DPG Media Group nv");
});

test("normalizeRdap leaves reseller unset when the entity's name is redacted", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      entities: [
        {
          roles: ["reseller"],
          vcardArray: ["vcard", [["fn", {}, "text", "REDACTED FOR PRIVACY"]]],
        },
      ],
    },
    [],
  );
  expect(rec.reseller).toBeUndefined();
});

test("normalizeRdap lowercases ldhName and never uses the handle as the name", () => {
  const upper = normalizeRdap(
    "google.com",
    "com",
    { ldhName: "GOOGLE.COM", handle: "2138514_DOMAIN_COM-VRSN" },
    [],
  );
  expect(upper.domain).toBe("google.com");
  expect(upper.punycodeName).toBe("google.com");
  const noName = normalizeRdap("example.com", "com", { handle: "2336799_DOMAIN_COM-VRSN" }, []);
  expect(noName.domain).toBe("example.com");
  expect(noName.punycodeName).toBeUndefined();
});

test("normalizeRdap combines registry and registrar copies of a contact and splits multi-role entities", () => {
  const vcard = (props: unknown[][]) => ["vcard", props];
  const rec = normalizeRdap(
    "example.org",
    "org",
    {
      ldhName: "example.org",
      entities: [
        // Registry copy (redacted), then the registrar's (full), as a merged .org document lists them
        {
          roles: ["registrant"],
          vcardArray: vcard([
            ["fn", {}, "text", ""],
            ["org", {}, "text", "Acme Inc"],
          ]),
        },
        { roles: ["technical"], vcardArray: vcard([["fn", {}, "text", ""]]) },
        {
          roles: ["registrant"],
          vcardArray: vcard([
            ["fn", {}, "text", "Jane Doe"],
            ["org", {}, "text", "Acme Inc"],
            ["email", {}, "text", "jane@acme.example"],
          ]),
        },
        {
          roles: ["administrative", "technical"],
          vcardArray: vcard([
            ["fn", {}, "text", "Ops Team"],
            ["email", {}, "text", "ops@acme.example"],
          ]),
        },
      ],
    },
    [],
  );
  expect(rec.contacts?.map((c) => [c.type, c.name, c.email])).toEqual([
    ["registrant", "Jane Doe", "jane@acme.example"],
    ["tech", "Ops Team", "ops@acme.example"],
    ["admin", "Ops Team", "ops@acme.example"],
  ]);
});

test("normalizeRdap fills registrar gaps from the registrar's own copy", () => {
  const ids = [{ type: "IANA Registrar ID", identifier: "292" }];
  const rec = normalizeRdap(
    "google.com",
    "com",
    {
      ldhName: "google.com",
      entities: [
        // Registry copy: name and IANA ID, abuse contact nested
        {
          roles: ["registrar"],
          publicIds: ids,
          vcardArray: ["vcard", [["fn", {}, "text", "MarkMonitor Inc."]]],
          entities: [
            {
              roles: ["abuse"],
              vcardArray: ["vcard", [["email", {}, "text", "abuse@markmonitor.com"]]],
            },
          ],
        },
        // The registrar's own copy, from its RDAP document
        {
          roles: ["registrar"],
          publicIds: ids,
          vcardArray: [
            "vcard",
            [
              ["fn", {}, "text", "Markmonitor Inc."],
              ["url", {}, "uri", "https://www.markmonitor.com"],
              ["tel", {}, "uri", "tel:+1.2083895740"],
              ["adr", {}, "text", ["", "", "3540 E Longwing Ln", "Meridian", "ID", "83646", "US"]],
            ],
          ],
        },
        // A different registrar's entity is not mixed in
        {
          roles: ["registrar"],
          publicIds: [{ type: "IANA Registrar ID", identifier: "1" }],
          vcardArray: ["vcard", [["email", {}, "text", "x@other.example"]]],
        },
      ],
    },
    [],
  );
  expect(rec.registrar).toMatchObject({
    name: "MarkMonitor Inc.",
    ianaId: "292",
    url: "https://www.markmonitor.com",
    phone: "+1.2083895740",
    email: "abuse@markmonitor.com",
    city: "Meridian",
  });
});

test("normalizeRdap skips null nameservers and DS records", () => {
  const rec = normalizeRdap(
    "example.com",
    "com",
    {
      ldhName: "example.com",
      nameservers: [null, { ldhName: "NS1.EXAMPLE.COM" }],
      secureDNS: { delegationSigned: true, dsData: [null] },
    },
    [],
  );
  expect(rec.nameservers).toEqual([{ host: "ns1.example.com" }]);
  expect(rec.dnssec).toEqual({ enabled: true, dsRecords: [] });
});
