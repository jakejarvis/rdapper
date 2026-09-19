import { describe, expect, it } from "vitest";
import { whoisQuery } from "./client";

describe("blockPrivateAddresses", () => {
  it("refuses to connect when the host resolves to loopback", async () => {
    await expect(
      whoisQuery("localhost", "example.com", { timeoutMs: 2000 }, { blockPrivateAddresses: true }),
    ).rejects.toMatchObject({
      code: "connect_failed",
      message: expect.stringContaining("non-public"),
    });
  });
});
