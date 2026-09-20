import { expect, test } from "vitest";
import { isPrivacyName } from "./privacy";

test("isPrivacyName flags redaction notices and privacy services", () => {
  for (const v of [
    "REDACTED FOR PRIVACY",
    "Data Redacted",
    "Privacy Protect, LLC",
    "WhoisGuard Protected",
    "Domains By Proxy, LLC",
    "Private Registration",
    "Domain Protection Services",
    "Identity Protection Service",
    "Withheld for Privacy ehf",
    "Datos Privados",
  ]) {
    expect(isPrivacyName(v), v).toBe(true);
  }
});

test("isPrivacyName does not flag ordinary names with ambiguous words", () => {
  for (const v of ["Private Equity Partners LLC", "Protection One", "Jane Private", "Acme Inc"]) {
    expect(isPrivacyName(v), v).toBe(false);
  }
});

test("isPrivacyName does not treat empty placeholders as privacy", () => {
  for (const v of ["-", "n/a", "N/A", "none", "not available"]) {
    expect(isPrivacyName(v), v).toBe(false);
  }
});
