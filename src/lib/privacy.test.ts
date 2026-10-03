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
    "Contacto Privado",
    "Proxy Protection LLC",
    "Whois Privacy Services Pty Ltd",
  ]) {
    expect(isPrivacyName(v), v).toBe(true);
  }
});

test("isPrivacyName does not flag ordinary names with ambiguous words", () => {
  for (const v of [
    "Private Equity Partners LLC",
    "Protection One",
    "Jane Private",
    "Acme Inc",
    "Tata Consultancy Services Private Limited",
    "Endurance Domains Technology Pvt. Ltd.",
    "Example Holdings Pte. Ltd.",
    "Allied Fire Protection Services Inc",
    "Private Client Services Ltd",
    "Contact Lens Protection Ltd",
    "Banco Privado Atlantico",
    "Hospital Privado de Córdoba S.A.",
    "Center for Privacy and Technology",
  ]) {
    expect(isPrivacyName(v), v).toBe(false);
  }
});

test("isPrivacyName does not treat empty placeholders as privacy", () => {
  for (const v of ["-", "n/a", "N/A", "none", "not available"]) {
    expect(isPrivacyName(v), v).toBe(false);
  }
});
