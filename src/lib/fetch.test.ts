import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike, LookupOptions } from "../types";
import { resolveFetch } from "./fetch";

describe("resolveFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return custom fetch when provided in options", () => {
    const customFetch: FetchLike = vi.fn();
    const options: LookupOptions = { customFetch };

    const result = resolveFetch(options);

    expect(result).toBe(customFetch);
  });

  it("should return global fetch when customFetch is not provided", () => {
    const options: LookupOptions = {};

    const result = resolveFetch(options);

    expect(result).toBe(fetch);
  });

  it("should return global fetch when options is undefined", () => {
    const result = resolveFetch(undefined);

    expect(result).toBe(fetch);
  });

  it("should return global fetch when options is an empty object", () => {
    const result = resolveFetch({});

    expect(result).toBe(fetch);
  });

  it("should preserve custom fetch function signature", () => {
    const customFetch: FetchLike = async (_input, _init) => {
      return new Response("test", { status: 200 });
    };
    const options: LookupOptions = { customFetch };

    const result = resolveFetch(options);

    expect(typeof result).toBe("function");
    expect(result).toBe(customFetch);
  });

  it("should work with type-compatible fetch implementations", async () => {
    let called = false;
    const customFetch: FetchLike = async (_input, _init) => {
      called = true;
      return new Response(JSON.stringify({ test: "data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const options: LookupOptions = { customFetch };

    const fetchFn = resolveFetch(options);
    const response = await fetchFn("https://example.com", { method: "GET" });
    const data = await response.json();

    expect(called).toBe(true);
    expect(data).toEqual({ test: "data" });
    expect(response.status).toBe(200);
  });

  it("should handle async custom fetch correctly", async () => {
    const customFetch: FetchLike = async (_input, _init) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("delayed", { status: 200 });
    };
    const options: LookupOptions = { customFetch };

    const fetchFn = resolveFetch(options);
    const response = await fetchFn("https://example.com");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("delayed");
  });
});
