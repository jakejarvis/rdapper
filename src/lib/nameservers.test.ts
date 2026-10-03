import { expect, test } from "vitest";
import { mergeNameservers } from "./nameservers";

test("mergeNameservers keeps one entry per host and unions glue", () => {
  expect(
    mergeNameservers(
      [{ host: "NS1.example.com" }, { host: "ns2.example.com", ipv4: ["192.0.2.2"] }],
      [
        { host: "ns1.example.com.", ipv4: ["192.0.2.1"] },
        { host: "ns2.example.com", ipv4: ["192.0.2.2"] },
      ],
    ),
  ).toEqual([
    { host: "ns1.example.com", ipv4: ["192.0.2.1"] },
    { host: "ns2.example.com", ipv4: ["192.0.2.2"] },
  ]);
});

test("mergeNameservers returns undefined for nothing", () => {
  expect(mergeNameservers(undefined, [])).toBeUndefined();
});
