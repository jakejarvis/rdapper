import { expect, test } from "vitest";
import { finalizeContact, redactionFields } from "./contacts";
import { isPlaceholderValue } from "./privacy";
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
  expect(isPlaceholderValue("Unknown Pleasures Ltd")).toBe(false);
});

test("package entry exports the contact predicates", () => {
  expect(typeof api.isPrivacyName).toBe("function");
  expect(typeof api.isPlaceholderValue).toBe("function");
  expect(api.resolveCountry("Germany", undefined)).toEqual({
    country: "Germany",
    countryCode: "DE",
  });
});
