import { expect, test } from "vitest";
import { paramList, parseVcard, readJCard } from "./vcard";

const jcard = (props: unknown[]) => ["vcard", [["version", {}, "text", "4.0"], ...props]];

test("readJCard tolerates malformed input", () => {
  expect(readJCard(undefined)).toEqual([]);
  expect(readJCard(["vcard", "nope"])).toEqual([]);
  expect(readJCard(["vcard", [null, 5, ["fn"], ["FN", {}, "text", "A"]]])).toMatchObject([
    { name: "fn", valueType: "text", value: undefined },
    { name: "fn", valueType: "text", value: "A" },
  ]);
});

test("paramList normalizes string/array params", () => {
  expect(paramList("FAX")).toEqual(["fax"]);
  expect(paramList(["Work", "fax"])).toEqual(["work", "fax"]);
  expect(paramList(undefined)).toEqual([]);
});

test("parseVcard splits org levels and reads kind/title/role", () => {
  const v = parseVcard(
    jcard([
      ["kind", {}, "text", "ORG"],
      ["org", {}, "text", ["Acme Corp", "Sales", "EMEA"]],
      ["title", {}, "text", "Head of Domains"],
      ["role", {}, "text", "Admin"],
    ]),
  );
  expect(v).toMatchObject({
    kind: "org",
    org: "Acme Corp",
    orgUnits: ["Sales", "EMEA"],
    title: "Head of Domains",
    role: "Admin",
  });
});

test("parseVcard handles string org and ignores unknown kind", () => {
  const v = parseVcard(
    jcard([
      ["kind", {}, "text", "robot"],
      ["org", {}, "text", "Solo Inc"],
    ]),
  );
  expect(v.kind).toBeUndefined();
  expect(v.org).toBe("Solo Inc");
  expect(v.orgUnits).toBeUndefined();
});

test("parseVcard keeps PO box and extended address, and strips tel: URIs", () => {
  const v = parseVcard(
    jcard([
      ["adr", { cc: "nl" }, "text", ["PO Box 1", "Suite 5", "1 Main St", "Town", "", "1000", "NL"]],
      ["tel", { type: "voice" }, "uri", "tel:+31.201234567"],
    ]),
  );
  expect(v.poBox).toBe("PO Box 1");
  expect(v.street).toEqual(["Suite 5", "1 Main St"]);
  expect(v.countryCode).toBe("NL");
  expect(v.tel).toEqual(["+31.201234567"]);
});
