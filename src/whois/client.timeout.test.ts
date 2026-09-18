import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeSocket extends EventEmitter {
  written: string[] = [];
  destroyed = false;
  write(data: string) {
    this.written.push(data);
  }
  destroy() {
    this.destroyed = true;
  }
}

let socket: FakeSocket;

vi.mock("node:net", () => ({
  createConnection: () => socket,
}));

import { whoisQuery } from "./client";

beforeEach(() => {
  vi.useFakeTimers();
  socket = new FakeSocket();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("whoisQuery timeouts", () => {
  it("rejects with a connect-stage timeout when the socket never connects", async () => {
    const p = whoisQuery("whois.example", "example.test", { timeoutMs: 1500 });
    const assertion = expect(p).rejects.toMatchObject({
      code: "timeout",
      stage: "connect",
      message: "WHOIS connect timeout (whois.example)",
    });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(socket.destroyed).toBe(true);
  });

  it("rejects with a read-stage timeout when connected but silent", async () => {
    const p = whoisQuery("whois.example", "example.test", { timeoutMs: 1500 });
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout", stage: "read" });
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("connect");
    expect(socket.written).toEqual(["example.test\r\n"]);
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it("resolves with the partial text when a read times out after some data", async () => {
    const p = whoisQuery("whois.example", "example.test", { timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("connect");
    socket.emit("data", Buffer.from("Domain Name: EXAMPLE.TEST\n"));
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toEqual({
      serverQueried: "whois.example",
      text: "Domain Name: EXAMPLE.TEST\n",
      partial: true,
    });
    expect(socket.destroyed).toBe(true);
  });

  it("does not corrupt multibyte characters split across chunks", async () => {
    const p = whoisQuery("whois.example", "example.test");
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("connect");
    const bytes = Buffer.from("Registrant: Zoë");
    socket.emit("data", bytes.subarray(0, bytes.length - 1));
    socket.emit("data", bytes.subarray(bytes.length - 1));
    socket.emit("end");
    await expect(p).resolves.toMatchObject({ text: "Registrant: Zoë" });
  });

  it.each([500, 1000])("honours a %ims timeout exactly (no -1000ms adjustment)", async (ms) => {
    const p = whoisQuery("whois.example", "example.test", { timeoutMs: ms });
    const assertion = expect(p).rejects.toMatchObject({ stage: "connect" });
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(socket.destroyed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("does not throw for timeoutMs 0; the timeout is simply disabled", async () => {
    const p = whoisQuery("whois.example", "example.test", { timeoutMs: 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.destroyed).toBe(false);
    socket.emit("connect");
    socket.emit("data", Buffer.from("ok"));
    socket.emit("end");
    await expect(p).resolves.toMatchObject({ text: "ok" });
  });

  it("destroys the socket and rejects as aborted on signal abort", async () => {
    const ctrl = new AbortController();
    const p = whoisQuery("whois.example", "example.test", { signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    expect(socket.destroyed).toBe(true);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      whoisQuery("whois.example", "example.test", { signal: ctrl.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
  });

  it("keeps the data when a server resets the connection after replying", async () => {
    const p = whoisQuery("whois.example", "example.test");
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("connect");
    socket.emit("data", Buffer.from("answer"));
    socket.emit("error", Object.assign(new Error("reset"), { code: "ECONNRESET" }));
    await expect(p).resolves.toMatchObject({ text: "answer", partial: true });
  });
});
