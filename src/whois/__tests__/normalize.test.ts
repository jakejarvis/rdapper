import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhois } from "../normalize.js";

test("WHOIS .de (DENIC-like) nserver lines", () => {
  const text = `
Domain: example.de
Nserver: ns1.example.net 192.0.2.1 2001:db8::1
Nserver: ns2.example.net
Status: connect
Changed: 2020-01-02
`;
  const rec = normalizeWhois(
    "example.de",
    "de",
    text,
    "whois.denic.de",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(rec.nameservers && rec.nameservers.length === 2);
  assert.equal(rec.nameservers?.[0].host, "ns1.example.net");
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
  const rec = normalizeWhois(
    "example.uk",
    "uk",
    text,
    "whois.nic.uk",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(rec.nameservers && rec.nameservers.length === 2);
  assert.ok(rec.creationDate);
  assert.ok(rec.expirationDate);
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
  const rec = normalizeWhois(
    "example.jp",
    "jp",
    text,
    "whois.jprs.jp",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(rec.creationDate);
  assert.ok(rec.expirationDate);
  assert.ok(rec.statuses);
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
  const rec = normalizeWhois(
    "example.io",
    "io",
    text,
    "whois.nic.io",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(rec.creationDate);
  assert.ok(rec.expirationDate);
  assert.ok(rec.nameservers && rec.nameservers.length === 2);
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
  const rec = normalizeWhois(
    "example.com",
    "com",
    text,
    "whois.verisign-grs.com",
    "2025-01-01T00:00:00Z",
  );
  assert.ok(rec.creationDate);
  assert.ok(rec.expirationDate);
  assert.equal(rec.source, "whois");
});
