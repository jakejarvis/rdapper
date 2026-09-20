import { expect, test } from "vitest";
import { countryCodeFromName, countryNameFromCode, resolveCountry } from "./countries";

test("country name <-> code resolution", () => {
  expect(countryNameFromCode("us")).toBe("United States");
  expect(countryNameFromCode("ZZ")).toBeUndefined();
  expect(countryCodeFromName("Iceland")).toBe("IS");
  expect(countryCodeFromName("United States of America")).toBe("US");
  expect(countryCodeFromName("Türkiye")).toBe("TR");
  expect(countryCodeFromName("Atlantis")).toBeUndefined();
});

test("resolveCountry fills whichever side is missing", () => {
  expect(resolveCountry("IS", undefined)).toEqual({ country: "Iceland", countryCode: "IS" });
  expect(resolveCountry("Canada", undefined)).toEqual({ country: "Canada", countryCode: "CA" });
  expect(resolveCountry(undefined, "de")).toEqual({ country: "Germany", countryCode: "DE" });
  expect(resolveCountry("Nowhere", undefined)).toEqual({
    country: "Nowhere",
    countryCode: undefined,
  });
});
