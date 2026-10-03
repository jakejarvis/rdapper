import { expect, test } from "vitest";
import { getSubRegistrySuffix, SUB_REGISTRIES } from "./subregistries";

test("getSubRegistrySuffix matches names registered under a sub-registry", () => {
  expect(getSubRegistrySuffix("google.uk.com")).toBe("uk.com");
  expect(getSubRegistrySuffix("Apple.COM.de.")).toBe("com.de");
  expect(getSubRegistrySuffix("www.google.us.com")).toBe("us.com");
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
