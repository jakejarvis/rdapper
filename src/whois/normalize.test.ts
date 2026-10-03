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

test("WHOIS FRED-style blocks (.mk, .cz) take dates from the domain block", () => {
  // Excerpt of whois.marnet.mk for marnet.mk: contact and nsset blocks repeat "created"
  const text = `
domain:       marnet.mk
registrant:   MARNET-R08502
nsset:        MARNET-NS15031
registrar:    MARNET-REG
registered:   22.05.2008 14:00:00
changed:      13.08.2023 16:38:49
expire:       22.05.2032

contact:      MARNET-R08502
org:          Example Org
address:      DATA REDACTED
registrar:    MARNET-REG
created:      DATA REDACTED

nsset:        MARNET-NS15031
nserver:      dns.marnet.mk (185.162.192.33)
registrar:    MARNET-REG
created:      13.08.2023 16:37:55
`;
  const rec = normalizeWhois("marnet.mk", "mk", text, "whois.marnet.mk");
  expect(rec.creationDate).toBe("2008-05-22T14:00:00Z");
  expect(rec.updatedDate).toBe("2023-08-13T16:38:49Z");
  expect(rec.expirationDate).toBe("2032-05-22T00:00:00Z");
});

test("WHOIS .tw TWNIC 'Record ... on' sentence dates", () => {
  // Excerpt of whois.twnic.net.tw for twnic.net.tw
  const text = [
    "Domain Name: twnic.net.tw",
    "   Domain Status: ok",
    "   Technical Contact:",
    "      (Redacted for privacy)",
    "",
    "   Record expires on 2099-12-31 23:59:59 (UTC+8)",
    "   Record created on 2000-02-02 15:06:48 (UTC+8)",
    "",
    "   Domain servers in listed order:",
    "      dns1.twnic.net.tw     210.65.47.29 ",
    "",
    "Registration Service Provider: TWNIC",
    "Registration Service URL: https://rs.twnic.tw/",
    "Registrar Abuse Contact Email: abuse@twnic.tw",
  ].join("\n");
  const rec = normalizeWhois("twnic.net.tw", "net.tw", text, "whois.twnic.net.tw");
  expect(rec.creationDate).toBe("2000-02-02T07:06:48Z");
  expect(rec.expirationDate).toBe("2099-12-31T15:59:59Z");
  expect(rec.registrar).toMatchObject({
    name: "TWNIC",
    url: "https://rs.twnic.tw/",
    email: "abuse@twnic.tw",
  });
});

test("WHOIS header-style date whose value follows a blank line still parses", () => {
  const text = "Domain Name: example.test\nCreation Date:\n\n    2020-01-02T03:04:05Z\n";
  expect(normalizeWhois("example.test", "test", text, undefined).creationDate).toBe(
    "2020-01-02T03:04:05Z",
  );
});

test("WHOIS statuses are EPP codes, including spelled-out ones", () => {
  const text = `
Domain Name: example.test
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
Domain Status: client update prohibited (https://icann.org/epp#clientUpdateProhibited)
Domain Status: ACTIVE
Domain Status: OK-UNTIL 20261004161638
`;
  const rec = normalizeWhois("example.test", "test", text, undefined);
  expect(rec.statuses?.map((s) => s.status)).toEqual([
    "clientTransferProhibited",
    "clientUpdateProhibited",
    "ok",
    "OK-UNTIL",
  ]);
  expect(rec.statuses?.[1]?.raw).toBe(
    "client update prohibited (https://icann.org/epp#clientUpdateProhibited)",
  );
});

test("WHOIS 'Reseller Name' (.au, .th) sets reseller", () => {
  const text =
    "Domain Name: example.com.au\nRegistrar Name: Registrar Pty Ltd\nReseller Name: Reseller Pty Ltd\n";
  expect(normalizeWhois("example.com.au", "com.au", text, undefined).reseller).toBe(
    "Reseller Pty Ltd",
  );
  // An empty field (common in .au) stays unset
  expect(
    normalizeWhois("example.com.au", "com.au", "Domain Name: x\nReseller Name: \n", undefined)
      .reseller,
  ).toBeUndefined();
});

test.each([
  ["DNSSEC: unsigned", false],
  ["DNSSEC: Inactive", false], // .ro
  ["DNSSEC: signedDelegation", true],
  ["dnssec:           signed delegation", true], // .se
  ["DNSSEC: active", true], // .bg
  ["DNSSEC: yes", true],
  ["DNSSEC signed: yes", true], // .rs
  ["DNSSEC                      : 서명\nDNSSEC                      : signed", true], // .kr
])("WHOIS DNSSEC %j -> enabled %s", (line, enabled) => {
  const rec = normalizeWhois(
    "example.test",
    "test",
    `Domain Name: example.test\n${line}\n`,
    undefined,
  );
  expect(rec.dnssec?.enabled).toBe(enabled);
});

test("WHOIS keys padded with dots (.fi)", () => {
  // Excerpt of whois.fi for traficom.fi
  const text = `
domain.............: traficom.fi
status.............: Registered
created............: 15.8.2017 15:02:40
expires............: 15.8.2029 15:02:40
modified...........: 23.5.2026 18:17:05

Nameservers
nserver............: ns1.z.fi [OK]
nserver............: ns2.z.fi [OK]

DNSSEC
dnssec.............: signed delegation
`;
  const rec = normalizeWhois("traficom.fi", "fi", text, "whois.fi");
  expect(rec).toMatchObject({
    creationDate: "2017-08-15T15:02:40Z",
    expirationDate: "2029-08-15T15:02:40Z",
    updatedDate: "2026-05-23T18:17:05Z",
    nameservers: [{ host: "ns1.z.fi" }, { host: "ns2.z.fi" }],
    dnssec: { enabled: true },
  });
});

test("WHOIS nameservers repeated in a glue block appear once (.ua)", () => {
  const text = `
domain:           hostmaster.ua
nserver:          bg.ns.ua
nserver:          ho1.ns.hostmaster.ua
status:           ok

% Glue Records:
% =============
nserver:          ho1.ns.hostmaster.ua
`;
  const rec = normalizeWhois("hostmaster.ua", "ua", text, "whois.ua");
  expect(rec.nameservers?.map((n) => n.host)).toEqual(["bg.ns.ua", "ho1.ns.hostmaster.ua"]);
});

test("WHOIS availability phrases in remarks of a real record don't mark it available", () => {
  // Excerpt of whois.nic.ir for nic.ir: the remarks mention "available for registration"
  const ir = `
domain:		nic.ir
holder-c:	ir00-irnic
nserver:	ns1.nic.ir
nserver:	ns2.nic.ir
source:		IRNIC

remarks:	This domain is only available for registration under certain conditions
`;
  expect(normalizeWhois("nic.ir", "ir", ir, "whois.nic.ir").isRegistered).toBe(true);
  const fax =
    "Domain Name: example.com\nCreation Date: 2020-01-01T00:00:00Z\nRegistrant Fax: not found\n";
  expect(normalizeWhois("example.com", "com", fax, undefined).isRegistered).toBe(true);
  expect(isAvailableByWhois(ir)).toBe(false);
});

test("WHOIS availability phrases still mark a reply with no record data available", () => {
  const text =
    'No match for "EXAMPLE-AVAILABLE.COM".\n>>> Last update of whois database: 2026-10-03T18:00:00Z <<<\n';
  expect(normalizeWhois("example-available.com", "com", text, undefined).isRegistered).toBe(false);
  // A release status wins even though the old record data is still shown
  const releasing =
    "domain: example.com.br\ncreated: 20100101\nnserver: ns1.example.com.br\nstatus: release process: waiting\n";
  expect(normalizeWhois("example.com.br", "com.br", releasing, undefined).isRegistered).toBe(false);
});

test("WHOIS statuses come from the domain's block, whole and split on commas", () => {
  const status = (text: string) =>
    normalizeWhois("example.test", "test", text, undefined).statuses?.map((s) => s.status);
  // .ua: contact blocks repeat "status:"
  expect(status("domain: x.ua\nstatus: ok\n\ncontact: H1\nstatus: ok\nstatus: linked\n")).toEqual([
    "ok",
  ]);
  // .fr: EPP codes under "eppstatus", contacts repeat it
  expect(
    status(
      "domain: x.fr\nstatus: ACTIVE\neppstatus: serverTransferProhibited\n\nnic-hdl: A1\neppstatus: active\n",
    ),
  ).toEqual(["serverTransferProhibited"]);
  // .mx: "State" is a contact's region
  expect(status("Domain Name: x.mx\n\nRegistrant:\n   State: Nuevo Leon\n")).toBeUndefined();
  // .ru: "state" beside the domain line
  expect(status("domain: X.RU\nstate: REGISTERED, DELEGATED, VERIFIED\n")).toEqual([
    "REGISTERED",
    "DELEGATED",
    "VERIFIED",
  ]);
  // .sk comma list, .il phrase, .cz FRED wording
  expect(
    status("Domain: x.sk\nDomain Status: serverRenewProhibited, serverUpdateProhibited\n"),
  ).toEqual(["serverRenewProhibited", "serverUpdateProhibited"]);
  expect(status("domain: x.il\nstatus: Transfer Locked\n")).toEqual(["Transfer Locked"]);
  const cz = normalizeWhois(
    "x.cz",
    "cz",
    "domain: x.cz\nstatus: Sponsoring registrar change forbidden\n",
    undefined,
  );
  expect(cz.statuses?.map((s) => s.status)).toEqual(["serverTransferProhibited"]);
  expect(cz.transferLock).toBe(true);
  // .be: EPP statuses under a separate "Flags:" header
  expect(
    status("Domain: x.be\nStatus: NOT AVAILABLE\n\nFlags:\n\tclientTransferProhibited\n"),
  ).toEqual(["NOT AVAILABLE", "clientTransferProhibited"]);
});

test.each([
  [
    "nserver: d.ns.nic.cz (193.29.206.1, 2001:678:1::1)",
    { ipv4: ["193.29.206.1"], ipv6: ["2001:678:1::1"] },
  ], // .cz
  [
    "nserver: k.dns.lu [194.0.1.13,2001:678:4::d]",
    { ipv4: ["194.0.1.13"], ipv6: ["2001:678:4::d"] },
  ], // .lu
  [
    "nserver: ns5.nic.ru. 31.177.67.100, 2a02:2090:e800::100",
    { ipv4: ["31.177.67.100"], ipv6: ["2a02:2090:e800::100"] },
  ], // .ru
  ["DNS: odisej.telekom.rs - 195.178.32.2", { ipv4: ["195.178.32.2"] }], // .rs
  [
    "Name Server: b.dns.pt | IPv4: 194.0.25.23 and IPv6: 2001:678:20::23",
    { ipv4: ["194.0.25.23"], ipv6: ["2001:678:20::23"] },
  ], // .pt
])("WHOIS nameserver glue in %j", (line, glue) => {
  const rec = normalizeWhois(
    "example.test",
    "test",
    `Domain Name: example.test\n${line}\n`,
    undefined,
  );
  expect(rec.nameservers).toHaveLength(1);
  expect(rec.nameservers?.[0]).toMatchObject(glue);
});

test("WHOIS nameserver keys and continuation lines across ccTLD layouts", () => {
  const hosts = (domain: string, text: string) =>
    normalizeWhois(domain, "test", text, undefined).nameservers?.map((n) => n.host);
  // .pl: continuation lines carrying IPv6 glue
  expect(
    hosts(
      "dns.pl",
      "nameservers:   bilbo.nask.org.pl. [195.187.245.51]\n               eomer.nask.net.pl. [193.59.201.24][2001:a10:1:ffff::2:c918]\ncreated:       1998.01.26 12:00:00\n",
    ),
  ).toEqual(["bilbo.nask.org.pl", "eomer.nask.net.pl"]);
  // .kr "Host Name", .tm "NS 7"
  expect(
    hosts("kisa.or.kr", "Primary Name Server\n   Host Name                : center.kisa.or.kr\n"),
  ).toEqual(["center.kisa.or.kr"]);
  expect(hosts("nic.tm", "NS 1 : dns1.nic.tm\nNS 7 : dns6.nic.tm\n")).toEqual([
    "dns1.nic.tm",
    "dns6.nic.tm",
  ]);
  // .dk names the domain itself on a "DNS:" line; .lv writes "-" for none
  expect(
    hosts(
      "punktum.dk",
      "Domain: punktum.dk\nDNS: punktum.dk\n\nHostname: auth01.ns.dk-hostmaster.dk\n",
    ),
  ).toEqual(["auth01.ns.dk-hostmaster.dk"]);
  expect(hosts("nic.lv", "Domain: nic.lv\nNserver: -\n")).toBeUndefined();
});

test("WHOIS date keys and forms across ccTLDs", () => {
  const rec = (text: string) =>
    normalizeWhois("example.test", "test", `domain: example.test\n${text}`, undefined);
  // .th, .sk, .by, .kr keys
  expect(rec("Created date:   30 Mar 1999\nExp date:   01 Apr 2030\n")).toMatchObject({
    creationDate: "1999-03-30T00:00:00Z",
    expirationDate: "2030-04-01T00:00:00Z",
  });
  expect(rec("Valid Until: 2027-06-10\n").expirationDate).toBe("2027-06-10T00:00:00Z");
  expect(rec("Update Date: 2025-10-21\n").updatedDate).toBe("2025-10-21T00:00:00Z");
  expect(rec("Last Updated Date           : 2025. 05. 09.\n").updatedDate).toBe(
    "2025-05-09T00:00:00Z",
  );
  // .il lists every change, oldest first
  expect(
    rec(
      "changed: domain-registrar AT isoc.org.il 19960111 (Assigned)\nchanged: domain-registrar AT isoc.org.il 20260930 (Changed)\n",
    ).updatedDate,
  ).toBe("2026-09-30T00:00:00Z");
  // .at keeps the time; .ro's "Before 2001" is not a date
  expect(rec("changed:        20200427 16:03:40\n").updatedDate).toBe("2020-04-27T16:03:40Z");
  expect(rec("Registered On: Before 2001\n").creationDate).toBeUndefined();
});

test("WHOIS DNSSEC comes from the domain's block, not the registrar's capability (.it)", () => {
  const it = `
Domain:             example.it
Status:             ok
Signed:             no

Registrar
  Organization:     Example Registrar S.r.l.
  DNSSEC:           yes
`;
  expect(normalizeWhois("example.it", "it", it, "whois.nic.it").dnssec).toEqual({ enabled: false });
  // .kr writes the Korean section first
  const kr = "DNSSEC                      : 서명\n\nDNSSEC                      : signed\n";
  expect(normalizeWhois("example.kr", "kr", kr, "whois.kr").dnssec).toEqual({ enabled: true });
});

test("WHOIS registrar from .lu 'registrar-name', not a contact's Organisation (.be)", () => {
  const lu = "domainname: dns.lu\nregistrar-name: Fondation Restena\n";
  expect(normalizeWhois("dns.lu", "lu", lu, "whois.dns.lu").registrar?.name).toBe(
    "Fondation Restena",
  );
  const be = `
Domain:	dnsbelgium.be
Status:	NOT AVAILABLE

Registrar Technical Contacts:
	Organisation: DNS Belgium vzw

Registrar:
	Name:	 DNS BE vzw/asbl
	Website: http://www.dns.be
`;
  expect(normalizeWhois("dnsbelgium.be", "be", be, "whois.dns.be").registrar).toEqual({
    name: "DNS BE vzw/asbl",
    url: "http://www.dns.be",
  });
});
