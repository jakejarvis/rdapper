import { expect, test } from "vitest";
import { finalizeContact, redactionFields } from "./contacts";
import { isPlaceholderValue, isPrivacyName } from "./privacy";
import * as api from "../index";

test("finalizeContact drops placeholder name/organization and records redactedFields", () => {
  const c = finalizeContact({
    type: "registrant",
    name: "REDACTED FOR PRIVACY",
    organization: "Data Protected",
    email: "Please query the RDDS service",
    street: ["REDACTED FOR PRIVACY"],
    city: "Berlin",
  });
  expect(c.name).toBeUndefined();
  expect(c.organization).toBeUndefined();
  expect(c.street).toBeUndefined();
  expect(c.city).toBe("Berlin");
  expect(c.redactedFields).toEqual(["name", "organization", "email", "street"]);
  expect(c.redacted).toBe(true);
  expect(c.privacyService).toBeUndefined();
});

test("finalizeContact keeps privacy-service names and flags privacyService", () => {
  const c = finalizeContact({ type: "registrant", name: "Domains By Proxy, LLC" });
  expect(c.name).toBe("Domains By Proxy, LLC");
  expect(c.privacyService).toBe(true);
  expect(c.redacted).toBe(true);
  expect(c.redactedFields).toBeUndefined();
});

test("finalizeContact cleans address fields and leaves real contacts untouched", () => {
  const c = finalizeContact({
    type: "admin",
    name: "Jane Doe",
    state: "REDACTED FOR PRIVACY",
    postalCode: "REDACTED FOR PRIVACY",
    title: "REDACTED",
  });
  expect(c.redactedFields).toEqual(["state", "postalCode"]);
  expect(c.title).toBeUndefined();
  const clean = finalizeContact({ type: "tech", name: "John Roe", city: "Paris" });
  expect(clean.redacted).toBeUndefined();
  expect(clean.redactedFields).toBeUndefined();
});

test("finalizeContact merges field hints", () => {
  const c = finalizeContact({ type: "tech" }, ["email", "phone"]);
  expect(c.redactedFields).toEqual(["email", "phone"]);
  expect(c.redacted).toBe(true);
});

test("redactionFields maps RFC 9537 names to contact fields", () => {
  expect(redactionFields("Registrant Email")).toEqual(["email"]);
  expect(redactionFields("Registrant Name")).toEqual(["name"]);
  expect(redactionFields("Registrant Organization")).toEqual(["organization"]);
  expect(redactionFields("Tech Phone Ext")).toEqual(["phone"]);
  expect(redactionFields("Registrant Street")).toEqual(["street"]);
  expect(redactionFields("Registrant Postal Code")).toEqual(["postalCode"]);
  expect(redactionFields("Registrant Country")).toEqual(["country"]);
});

test("redactionFields falls back to the vCard property in prePath", () => {
  const path = (prop: string, tail = "") =>
    `$.entities[?(@.roles[0]=='registrant')].vcardArray[1][?(@[0]=='${prop}')]${tail}`;
  expect(redactionFields("Redacted", path("email"))).toEqual(["email"]);
  expect(redactionFields("REDACTED", path("fn"))).toEqual(["name"]);
  expect(redactionFields("x", path("org"))).toEqual(["organization"]);
  expect(redactionFields("x", path("tel"))).toEqual(["phone"]);
  expect(redactionFields("x", path("adr", "[3][3]"))).toEqual(["city"]);
  expect(redactionFields("x", path("adr", "[3][6]"))).toEqual(["country"]);
  expect(redactionFields("x", path("adr"))).toContain("street");
  expect(redactionFields("x", "$.entities[0]")).toEqual([]);
  // The name wins when it identifies fields
  expect(redactionFields("Registrant Email", path("fn"))).toEqual(["email"]);
});

test("isPlaceholderValue covers common registry boilerplate", () => {
  for (const v of [
    "Not available from registry",
    "Not Applicable",
    "Data Protected",
    "STATUTORY MASKING ENABLED",
    "GDPR Masked",
    "Select Request Email Form",
    "Unknown",
  ]) {
    expect(isPlaceholderValue(v), v).toBe(true);
  }
  // Bare tokens only match the whole value
  expect(isPlaceholderValue("Unknown Pleasures Ltd")).toBe(false);
  expect(isPlaceholderValue("Na Health Inc")).toBe(false);
});

test("package entry exports the contact predicates", () => {
  expect(typeof api.isPrivacyName).toBe("function");
  expect(typeof api.isPlaceholderValue).toBe("function");
  expect(api.resolveCountry("Germany", undefined)).toEqual({
    country: "Germany",
    countryCode: "DE",
  });
});

test("finalizeContact drops placeholder countries but keeps real ones", () => {
  const na = finalizeContact({ type: "registrant", country: "N/A" });
  expect(na.country).toBeUndefined();
  expect(na.redactedFields).toEqual(["country"]);
  expect(na.redacted).toBe(true);

  const rp = finalizeContact({ type: "registrant", country: "REDACTED FOR PRIVACY" });
  expect(rp.country).toBeUndefined();
  expect(rp.redactedFields).toEqual(["country"]);

  const namibia = finalizeContact({ type: "registrant", country: "NA" });
  expect(namibia.countryCode).toBe("NA");
  expect(namibia.country).toBe("Namibia");
  expect(namibia.redacted).toBeUndefined();
});

test("finalizeContact treats bare 'not available' style values as placeholders", () => {
  for (const v of ["Not Available", "Not Published", "Not Public", "No Data", ".."]) {
    expect(isPlaceholderValue(v)).toBe(true);
  }
  expect(isPlaceholderValue("No Data Corp")).toBe(false);
});

test("finalizeContact is idempotent", () => {
  const once = finalizeContact({
    type: "registrant",
    name: "Domains By Proxy, LLC",
    email: "REDACTED FOR PRIVACY",
    country: "N/A",
  });
  const twice = finalizeContact(structuredClone(once));
  expect(twice).toEqual(once);
});

test("finalizeContact and isPrivacyContact are exported", () => {
  expect(api.finalizeContact).toBe(finalizeContact);
  expect(api.isPrivacyContact({ type: "registrant", privacyService: true })).toBe(true);
});

test("bare 'not available' phrases are whole-value only", () => {
  expect(isPlaceholderValue("Address not available in this region")).toBe(false);
  expect(isPlaceholderValue("Not Available")).toBe(true);
  expect(isPrivacyName("Not Available")).toBe(false);
  expect(isPrivacyName("No Data Corp")).toBe(false);
});

test("redactionFields handles country code and multi-field names", () => {
  expect(redactionFields("Registrant Country Code")).toEqual(["country"]);
  expect(redactionFields("Registrant Street, City, Country")).toEqual([
    "street",
    "city",
    "country",
  ]);
});

test("a dropped country keeps a separate countryCode, and survives re-finalizing", () => {
  const c = finalizeContact({ type: "registrant", country: "N/A", countryCode: "US" });
  expect(c.countryCode).toBe("US");
  expect(c.country).toBe("United States");
  expect(c.redactedFields).toEqual(["country"]);
  expect(c.redacted).toBe(true);

  const again = finalizeContact(structuredClone(c));
  expect(again.redactedFields).toEqual(["country"]);
  expect(again.redacted).toBe(true);
  expect(again).toEqual(c);
});
