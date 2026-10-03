import { expect, test } from "vitest";
import { getSubRegistrySuffix, SUB_REGISTRIES } from "./subregistries";

test("getSubRegistrySuffix matches names registered under a sub-registry", () => {
  expect(getSubRegistrySuffix("google.uk.com")).toBe("uk.com");
  expect(getSubRegistrySuffix("Apple.COM.de.")).toBe("com.de");
  expect(getSubRegistrySuffix("www.google.us.com")).toBe("us.com");
  expect(getSubRegistrySuffix("ox.ac.uk")).toBe("ac.uk");
});

test("getSubRegistrySuffix ignores the suffix itself and ordinary domains", () => {
  // uk.com itself is a .com registration
  expect(getSubRegistrySuffix("uk.com")).toBeUndefined();
  expect(getSubRegistrySuffix("google.com")).toBeUndefined();
  expect(getSubRegistrySuffix("example.co.uk")).toBeUndefined();
  expect(getSubRegistrySuffix("constructor.toString")).toBeUndefined();
});

test("SUB_REGISTRIES points each suffix at its own CentralNic RDAP path", () => {
  expect(SUB_REGISTRIES["uk.com"]).toEqual({
    rdap: "https://rdap.centralnic.com/uk.com/",
    whois: "whois.centralnic.com",
  });
});

test("SUB_REGISTRIES sends ac.uk to Jisc's WHOIS, with no RDAP", () => {
  expect(SUB_REGISTRIES["ac.uk"]).toEqual({ whois: "whois.ja.net" });
});

test("SUB_REGISTRIES keeps nhs.uk and police.uk names away from Nominet", () => {
  // Nominet's RDAP answers 404 for them, which would read as "not registered"
  expect(SUB_REGISTRIES["nhs.uk"]).toEqual({});
  expect(SUB_REGISTRIES["police.uk"]).toEqual({});
  expect(getSubRegistrySuffix("england.nhs.uk")).toBe("nhs.uk");
});
