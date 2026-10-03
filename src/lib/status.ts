// EPP domain status codes (RFC 5731, RFC 3915). RDAP spells each as lowercase words
// ("client transfer prohibited"), except "ok", which RDAP calls "active" (RFC 8056).
const EPP_STATUSES = [
  "ok",
  "inactive",
  "clientDeleteProhibited",
  "clientHold",
  "clientRenewProhibited",
  "clientTransferProhibited",
  "clientUpdateProhibited",
  "serverDeleteProhibited",
  "serverHold",
  "serverRenewProhibited",
  "serverTransferProhibited",
  "serverUpdateProhibited",
  "pendingCreate",
  "pendingDelete",
  "pendingRenew",
  "pendingRestore",
  "pendingTransfer",
  "pendingUpdate",
  "addPeriod",
  "autoRenewPeriod",
  "renewPeriod",
  "transferPeriod",
  "redemptionPeriod",
];

const BY_KEY = new Map<string, string>([
  ...EPP_STATUSES.map((code): [string, string] => [code.toLowerCase(), code]),
  ["active", "ok"],
]);

/** "Client Transfer-Prohibited", "client_transfer_prohibited" -> "clienttransferprohibited" */
function keyOf(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Map a status from either source to its EPP code ("client transfer prohibited" and
 * "clientTransferProhibited" both give "clientTransferProhibited"; RDAP "active" gives "ok").
 * Values with no EPP equivalent (RDAP "locked", ccTLD-specific statuses) are returned trimmed.
 */
export function normalizeEppStatus(value: string): string {
  const trimmed = value.trim();
  return BY_KEY.get(keyOf(trimmed)) ?? trimmed;
}

/** Whether a value is (a spelling of) an EPP status code. */
export function isEppStatus(value: string): boolean {
  return BY_KEY.has(keyOf(value));
}
