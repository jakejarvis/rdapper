import { expect, test } from "vitest";
import { parseKeyValueLines } from "./text";

test("parseKeyValueLines reads unindented values right under a header (.bg, .pl)", () => {
  const map = parseKeyValueLines(
    "NAME SERVER INFORMATION:\nns.digsys.bg \nns.register.bg 192.92.129.99 2a02:6a80::192:92:129:99\n\nDNSSEC: active\n",
  );
  expect(map["name server information"]).toEqual([
    "ns.digsys.bg",
    "ns.register.bg 192.92.129.99 2a02:6a80::192:92:129:99",
  ]);
  expect(map.dnssec).toEqual(["active"]);
});

test("parseKeyValueLines takes a single token after a blank line as a header's first value (.hk)", () => {
  const map = parseKeyValueLines(
    "Name Servers Information:\n\nNS7.HKIRC.NET.HK\nNS8.HKIRC.NET.HK\n\nReseller: \n\nCDN Variant / Punycode\n",
  );
  expect(map["name servers information"]).toEqual(["NS7.HKIRC.NET.HK", "NS8.HKIRC.NET.HK"]);
  // A phrase after the blank line is the next section's title, not the reseller
  expect(map.reseller).toEqual([]);
});

test("parseKeyValueLines treats short colon-less lines as section headers (.it)", () => {
  const map = parseKeyValueLines(
    "Domain:             nic.it\n\nRegistrar\n  Organization:     ccTLD 'it' Registry\n  Name:             REGISTRY-REG\n  DNSSEC:           yes\n\nNameservers\n  dns.nic.it\n  a.dns.it\n",
  );
  expect(map.nameservers).toEqual(["dns.nic.it", "a.dns.it"]);
  expect(map["registrar organization"]).toEqual(["ccTLD 'it' Registry"]);
  expect(map["registrar dnssec"]).toEqual(["yes"]);
});

test("parseKeyValueLines records nested keys under their header (.eu, .uk)", () => {
  const eu = parseKeyValueLines(
    "Registrar:\n        Name: EURid vzw\n        Website: https://www.eurid.eu\n",
  );
  expect(eu["registrar name"]).toEqual(["EURid vzw"]);
  expect(eu["registrar website"]).toEqual(["https://www.eurid.eu"]);
  // Nominet indents headers by 4 and their contents by 8
  const uk = parseKeyValueLines(
    "    Registrar:\n        Registrar Ltd [Tag = REGTAG]\n        URL: https://registrar.example\n\n    Relevant dates:\n        Registered on: 01-Jan-2020\n",
  );
  expect(uk.registrar).toEqual(["Registrar Ltd [Tag = REGTAG]"]);
  expect(uk["registrar url"]).toEqual(["https://registrar.example"]);
  expect(uk["registered on"]).toEqual(["01-Jan-2020"]);
  expect(uk["registrar registered on"]).toBeUndefined();
});
