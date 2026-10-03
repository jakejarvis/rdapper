import { expect, test } from "vitest";
import { isEppStatus, normalizeEppStatus } from "./status";

test("normalizeEppStatus maps RDAP and WHOIS spellings to the EPP code", () => {
  expect(normalizeEppStatus("client transfer prohibited")).toBe("clientTransferProhibited");
  expect(normalizeEppStatus("clientTransferProhibited")).toBe("clientTransferProhibited");
  expect(normalizeEppStatus("CLIENT_TRANSFER_PROHIBITED")).toBe("clientTransferProhibited");
  expect(normalizeEppStatus("auto renew period")).toBe("autoRenewPeriod");
  expect(normalizeEppStatus(" server hold ")).toBe("serverHold");
  // RFC 8056: EPP "ok" is RDAP "active"
  expect(normalizeEppStatus("active")).toBe("ok");
  expect(normalizeEppStatus("OK")).toBe("ok");
});

test("normalizeEppStatus leaves values without an EPP equivalent alone", () => {
  expect(normalizeEppStatus("locked")).toBe("locked");
  expect(normalizeEppStatus("pending release")).toBe("pending release");
  expect(normalizeEppStatus("connect")).toBe("connect");
  expect(normalizeEppStatus("OK-UNTIL")).toBe("OK-UNTIL");
});

test("isEppStatus recognizes either spelling", () => {
  expect(isEppStatus("redemption period")).toBe(true);
  expect(isEppStatus("redemptionPeriod")).toBe(true);
  expect(isEppStatus("Registered until expiry date.")).toBe(false);
});
