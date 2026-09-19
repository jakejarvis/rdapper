import { describe, expect, it } from "vitest";
import { isSafeWhoisReferralHost } from "./host";

describe("isSafeWhoisReferralHost", () => {
  it.each([
    "whois.markmonitor.com",
    "whois.1api.net",
    "WHOIS.GODADDY.COM",
    "whois.nic.xn--p1ai",
    "8.8.8.8",
    "2606:4700:4700::1111",
    "::ffff:808:808",
    "whois.example.com.",
  ])("accepts %s", (h) => expect(isSafeWhoisReferralHost(h)).toBe(true));

  it.each([
    "",
    "localhost",
    "foo.localhost",
    "printer.local",
    "db.internal",
    "intranet",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "64:ff9b::7f00:1",
    "::127.0.0.1",
    "2002:7f00:1::",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "fec0::1",
    "[::1]",
    "1:2:3:4:5:6:7:8:9",
    "2130706433",
    "0x7f.1",
    "whois.example.com:43",
    "user@whois.example.com",
    "whois.example.com/path",
    "who is.example.com",
    "-bad.example.com",
    `${"a".repeat(64)}.example.com`,
    `${"a.".repeat(130)}com`,
  ])("rejects %j", (h) => expect(isSafeWhoisReferralHost(h)).toBe(false));
});
