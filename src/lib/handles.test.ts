import { expect, test } from "vitest";
import { isRegistryHandle, looksLikeHandle } from "./handles";

test("isRegistryHandle recognizes NIC handles", () => {
  for (const handle of [
    "JJ1234-IS",
    "NG8867695-NICAT",
    "C123-LRMS",
    "ABC123-RIPE",
    "AB1-NORID",
    "G31071",
    "C12345678",
    " JJ1234-IS ",
  ]) {
    expect(isRegistryHandle(handle), handle).toBe(true);
  }
});

test("isRegistryHandle keeps names that only resemble handles", () => {
  for (const name of [
    "3M",
    "ACME-CORP",
    "Jane Doe",
    "Example Org 1234",
    "jj1234-is",
    "Company123",
  ]) {
    expect(isRegistryHandle(name), name).toBe(false);
  }
});

test("looksLikeHandle is broad: any single token with a digit, or an uppercase code", () => {
  expect(looksLikeHandle("292")).toBe(true);
  expect(looksLikeHandle("CZ-NIC")).toBe(true);
  expect(looksLikeHandle("Company123")).toBe(true);
  expect(looksLikeHandle("MarkMonitor")).toBe(false);
  expect(looksLikeHandle("Example Registrar 2")).toBe(false);
});
