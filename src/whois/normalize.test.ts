import { expect, test } from "vitest";
import { isAvailableByWhois, normalizeWhois } from "./normalize";

test("WHOIS .de (DENIC-like) nserver lines", () => {
  const text = `
Domain: example.de
Nserver: ns1.example.net 192.0.2.1 2001:db8::1
Nserver: ns2.example.net
Status: connect
Changed: 2020-01-02
`;
  const rec = normalizeWhois("example.de", "de", text, "whois.denic.de");
  expect(rec.nameservers && rec.nameservers.length === 2).toBe(true);
  expect(rec.nameservers).toBeDefined();
  expect(rec.nameservers?.[0]?.host).toBe("ns1.example.net");
});

test("WHOIS .uk Nominet style", () => {
  const text = `
Domain name:
        example.uk
Data validation:
        Nominet was able to match the registrant's name and address against a 3rd party data source on 01-Jan-2020
Registrar:
        Registrar Ltd [Tag = REGTAG]
        URL: https://registrar.example
Registered on: 01-Jan-2020
Expiry date: 01-Jan-2030
Last updated: 01-Jan-2021
Name servers:
        ns1.example.net 192.0.2.1
        ns2.example.net
`;
  const rec = normalizeWhois("example.uk", "uk", text, "whois.nic.uk");
  expect(rec.nameservers && rec.nameservers.length === 2).toBe(true);
  expect(Boolean(rec.creationDate)).toBe(true);
  expect(Boolean(rec.expirationDate)).toBe(true);
});

test("WHOIS .jp JPRS style privacy redacted", () => {
  const text = `
[Domain Name]                EXAMPLE.JP
[Registrant]                 (Not Disclosed)
[Name Server]                ns1.example.jp
[Name Server]                ns2.example.jp
[Created on]                 2020/01/02
[Expires on]                 2030/01/02
[Status]                     Active
`;
  const rec = normalizeWhois("example.jp", "jp", text, "whois.jprs.jp");
  expect(Boolean(rec.creationDate)).toBe(true);
  expect(Boolean(rec.expirationDate)).toBe(true);
  expect(Boolean(rec.statuses)).toBe(true);
});

test("WHOIS .io NIC.IO style", () => {
  const text = `
Domain Name: EXAMPLE.IO
Registry Domain ID: D000000000000-IONIC
Registrar WHOIS Server: whois.registrar.test
Registrar URL: http://www.registrar.test
Updated Date: 2021-01-02T03:04:05Z
Creation Date: 2020-01-02T03:04:05Z
Registry Expiry Date: 2030-01-02T03:04:05Z
Registrar: Registrar LLC
Name Server: NS1.EXAMPLE.IO
Name Server: NS2.EXAMPLE.IO
DNSSEC: unsigned
`;
  const rec = normalizeWhois("example.io", "io", text, "whois.nic.io");
  expect(Boolean(rec.creationDate)).toBe(true);
  expect(Boolean(rec.expirationDate)).toBe(true);
  expect(rec.nameservers && rec.nameservers.length === 2).toBe(true);
});

test("WHOIS registrar response with Registrar Registration Expiration Date", () => {
  const text = `
Domain Name: EXAMPLE.US
Registrar WHOIS Server: whois.registrar.test
Registrar URL: http://www.registrar.test
Updated Date: 2025-03-23T10:53:03+0000
Creation Date: 2020-04-24T15:03:39+0000
Registrar Registration Expiration Date: 2027-04-23T00:00:00+0000
Registrar: Registrar LLC
`;
  const rec = normalizeWhois("example.us", "us", text, "whois.registrar.test");
  expect(Boolean(rec.expirationDate)).toBe(true);
  expect(rec.expirationDate).toBe("2027-04-23T00:00:00Z");
});

// removed: availability override test in favor of referral-level logic

test("WHOIS .edu EDUCAUSE format", () => {
  const text = `
This Registry database contains ONLY .EDU domains.

Domain Name: TUFTS.EDU

Domain record activated:    22-Jun-1987
Domain record last updated: 02-Jul-2025
Domain expires:             31-Jul-2026
`;
  const rec = normalizeWhois("tufts.edu", "edu", text, "whois.educause.edu");
  expect(rec.creationDate).toBe("1987-06-22T00:00:00Z");
  expect(rec.updatedDate).toBe("2025-07-02T00:00:00Z");
  expect(rec.expirationDate).toBe("2026-07-31T00:00:00Z");
});

test("WHOIS .it uses 'Expire Date' for expiration", () => {
  const text = `
Domain:                 EXAMPLE.IT
Registrar:              Registrar S.p.A.
Expire Date:            2026-01-20
Last Update:            2025-01-10
`;
  const rec = normalizeWhois("example.it", "it", text, "whois.nic.it");
  expect(rec.expirationDate).toBe("2026-01-20T00:00:00Z");
});

test("WHOIS .cn uses 'Registration Time' and 'Expiration Time'", () => {
  const text = `
Domain Name: example.cn
ROID: 20200102s10001s00000000-cn
Registration Time: 2020-01-02 03:04:05
Expiration Time: 2031-01-02 03:04:05
`;
  const rec = normalizeWhois("example.cn", "cn", text, "whois.cnnic.cn");
  expect(rec.creationDate).toBe("2020-01-02T03:04:05Z");
  expect(rec.expirationDate).toBe("2031-01-02T03:04:05Z");
});

test("WHOIS with bare 'expires' key is recognized", () => {
  const text = `
domain: example.in.ua
created: 2020-01-02 03:04:05+03
expires: 2030-01-02 03:04:05+03
`;
  const rec = normalizeWhois("example.in.ua", "in.ua", text, "whois.in.ua");
  expect(Boolean(rec.expirationDate)).toBe(true);
  expect(rec.expirationDate).toBe("2030-01-02T00:04:05Z");
});

test("Privacy redacted WHOIS normalizes without contacts", () => {
  const text = `
Domain Name: EXAMPLE.COM
Registry Domain ID: 0000000000_DOMAIN_COM-VRSN
Registrar WHOIS Server: whois.registrar.test
Registrar URL: http://www.registrar.test
Updated Date: 2021-01-02T03:04:05Z
Creation Date: 2020-01-02T03:04:05Z
Registry Expiry Date: 2030-01-02T03:04:05Z
Registrar: Registrar LLC
Registrant Organization: Privacy Protect, LLC
Registrant State/Province: CA
Registrant Country: US
Registrant Email: Please query the RDDS service of the Registrar of Record identified in this output for information on how to contact the Registrant, Admin, or Tech contact of the queried domain name.
Name Server: NS1.EXAMPLE.COM
Name Server: NS2.EXAMPLE.COM
DNSSEC: unsigned
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
`;
  const rec = normalizeWhois("example.com", "com", text, "whois.verisign-grs.com");
  expect(Boolean(rec.creationDate)).toBe(true);
  expect(Boolean(rec.expirationDate)).toBe(true);
  expect(rec.source).toBe("whois");
});

test("WHOIS derives privacyEnabled from registrant keywords", () => {
  const text = `
Domain Name: EXAMPLE.COM
Registrar WHOIS Server: whois.registrar.test
Registrar URL: http://www.registrar.test
Registrant Name: REDACTED FOR PRIVACY
Registrant Organization: Example Org
`;
  const rec = normalizeWhois("example.com", "com", text, "whois.verisign-grs.com");
  expect(rec.privacyEnabled).toBe(true);
});

test("isAvailableByWhois correctly identifies availability patterns", () => {
  const patterns = [
    "Domain not found",
    "No information available",
    "no se encuentra registrado",
    "object_not_found",
    "is free",
    "no data was found",
    "no entries found",
    "No Data Found",
    "No information was found",
    "No match",
    "No object found",
    "Not been registered",
    "Does not exist",
    "NOT FOUND",
    "Status: free",
    "Status: available",
    "unassignable",
  ];

  for (const pattern of patterns) {
    expect(isAvailableByWhois(pattern)).toBe(true);
  }

  // Also verify that normalizeWhois marks isRegistered=false
  const text = "Domain not found";
  const rec = normalizeWhois("example.com", "com", text, "whois.example.com");
  expect(rec.isRegistered).toBe(false);
});

test("WHOIS .gov.ua extracts dates from noisy values and OK-UNTIL", () => {
  const text = `
domain: agrex.gov.ua
status: OK-UNTIL 20261004161638
created: 0-UANIC 20111004161638
modified: UARR149-UANIC 20251004050127
`;
  const rec = normalizeWhois("agrex.gov.ua", "gov.ua", text, "whois.gov.ua");
  expect(rec.creationDate).toBe("2011-10-04T16:16:38Z");
  expect(rec.updatedDate).toBe("2025-10-04T05:01:27Z");
  expect(rec.expirationDate).toBe("2026-10-04T16:16:38Z");
});

test("WHOIS .br 'release process: waiting' is not registered", () => {
  const text = `
domain:      iba.com.br
release process:  waiting
`;
  expect(isAvailableByWhois(text)).toBe(true);
  expect(normalizeWhois("iba.com.br", "com.br", text, "whois.registro.br").isRegistered).toBe(
    false,
  );
});

test("WHOIS .br published domain is registered with compact dates", () => {
  const text = `
domain:      iba.com.br
nserver:     ns11.cloudns.net
created:     20260319 #31066859
changed:     20260414
expires:     20270319
status:      published
`;
  const rec = normalizeWhois("iba.com.br", "com.br", text, "whois.registro.br");
  expect(rec.isRegistered).toBe(true);
  expect(rec.creationDate).toBe("2026-03-19T00:00:00Z");
  expect(rec.updatedDate).toBe("2026-04-14T00:00:00Z");
  expect(rec.expirationDate).toBe("2027-03-19T00:00:00Z");
});

test("WHOIS .gg header-style blocks with colons in values", () => {
  const text = `
Domain:
     t3.gg

Domain Status:
     Active

Registrant:
     T3 Tools Inc

Registrar:
     epag (http://www.epag.de)

Relevant dates:
     Registered on 28th December 2018 at 05:54:43.861
     Registry fee due on 28th December each year

Registration status:
     Registered until cancelled

Name servers:
     ns1.vercel-dns.com
     ns2.vercel-dns.com
`;
  const rec = normalizeWhois("t3.gg", "gg", text, "whois.gg");
  expect(rec.isRegistered).toBe(true);
  expect(rec.creationDate).toBe("2018-12-28T05:54:43Z");
  expect(rec.expirationDate).toBeUndefined();
  expect(rec.registrar).toEqual({ name: "epag", url: "http://www.epag.de" });
  expect(rec.nameservers?.map((n) => n.host)).toEqual(["ns1.vercel-dns.com", "ns2.vercel-dns.com"]);
});

test("WHOIS resolves country code/name and flags placeholder contact values", () => {
  const rec = normalizeWhois(
    "example.com",
    "com",
    `Domain Name: EXAMPLE.COM
Registrant Name: Jane Doe
Registrant Email: Please query the RDDS service of the Registrar of Record identified in this output
Registrant Country: DE
Admin Name: John Roe
Admin Country: Canada
`,
    "whois.example",
  );
  const registrant = rec.contacts?.find((c) => c.type === "registrant");
  expect(registrant).toMatchObject({ country: "Germany", countryCode: "DE", redacted: true });
  expect(registrant?.email).toBeUndefined();
  const admin = rec.contacts?.find((c) => c.type === "admin");
  expect(admin).toMatchObject({ country: "Canada", countryCode: "CA" });
  expect(admin?.redacted).toBeUndefined();
});
