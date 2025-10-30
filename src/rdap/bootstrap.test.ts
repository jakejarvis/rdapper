import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { BootstrapData } from "../types";
import { getRdapBaseUrlsForTld } from "./bootstrap";

// Mock the global fetch function
beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("getRdapBaseUrlsForTld with customBootstrapData", () => {
  const validBootstrapData: BootstrapData = {
    version: "1.0",
    publication: "2025-01-15T12:00:00Z",
    description: "Test RDAP Bootstrap",
    services: [
      [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
      [["org"], ["https://rdap.publicinterestregistry.org/"]],
      [["io"], ["https://rdap.nic.io/"]],
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("valid customBootstrapData", () => {
    it("should use customBootstrapData when provided", async () => {
      const urls = await getRdapBaseUrlsForTld("com", {
        customBootstrapData: validBootstrapData,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).not.toHaveBeenCalled(); // No fetch when data is provided
    });

    it("should return multiple base URLs for TLD with multiple servers", async () => {
      const dataWithMultiple: BootstrapData = {
        version: "1.0",
        publication: "2025-01-15T12:00:00Z",
        services: [
          [
            ["test"],
            [
              "https://rdap1.example.com/",
              "https://rdap2.example.com/",
              "https://rdap3.example.com",
            ],
          ],
        ],
      };

      const urls = await getRdapBaseUrlsForTld("test", {
        customBootstrapData: dataWithMultiple,
      });

      expect(urls).toEqual([
        "https://rdap1.example.com/",
        "https://rdap2.example.com/",
        "https://rdap3.example.com/",
      ]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should return empty array when TLD not found in customBootstrapData", async () => {
      const urls = await getRdapBaseUrlsForTld("notfound", {
        customBootstrapData: validBootstrapData,
      });

      expect(urls).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should handle TLDs case-insensitively", async () => {
      const urls = await getRdapBaseUrlsForTld("COM", {
        customBootstrapData: validBootstrapData,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should normalize URLs without trailing slash", async () => {
      const dataWithoutSlash: BootstrapData = {
        version: "1.0",
        publication: "2025-01-15T12:00:00Z",
        services: [[["test"], ["https://rdap.example.com"]]],
      };

      const urls = await getRdapBaseUrlsForTld("test", {
        customBootstrapData: dataWithoutSlash,
      });

      expect(urls).toEqual(["https://rdap.example.com/"]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should deduplicate duplicate URLs", async () => {
      const dataWithDuplicates: BootstrapData = {
        version: "1.0",
        publication: "2025-01-15T12:00:00Z",
        services: [
          [["test"], ["https://rdap.example.com/", "https://rdap.example.com"]],
        ],
      };

      const urls = await getRdapBaseUrlsForTld("test", {
        customBootstrapData: dataWithDuplicates,
      });

      expect(urls).toEqual(["https://rdap.example.com/"]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should handle multi-label TLDs (e.g., co.uk)", async () => {
      const dataWithMultiLabel: BootstrapData = {
        version: "1.0",
        publication: "2025-01-15T12:00:00Z",
        services: [[["co.uk", "org.uk"], ["https://rdap.nominet.uk/"]]],
      };

      const urls = await getRdapBaseUrlsForTld("co.uk", {
        customBootstrapData: dataWithMultiLabel,
      });

      expect(urls).toEqual(["https://rdap.nominet.uk/"]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("priority order: customBootstrapData over customBootstrapUrl", () => {
    it("should use customBootstrapData and ignore customBootstrapUrl", async () => {
      const urls = await getRdapBaseUrlsForTld("com", {
        customBootstrapData: validBootstrapData,
        customBootstrapUrl: "https://should-not-fetch.example.com/dns.json",
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should use customBootstrapData and ignore default IANA URL", async () => {
      const urls = await getRdapBaseUrlsForTld("com", {
        customBootstrapData: validBootstrapData,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("invalid customBootstrapData validation", () => {
    it("should throw when customBootstrapData is null", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: null as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when customBootstrapData is undefined", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: undefined as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when customBootstrapData is a string", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: "invalid" as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when customBootstrapData is a number", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: 123 as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        "Invalid customBootstrapData: expected an object. See BootstrapData type for required structure.",
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when customBootstrapData is an array", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: [] as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when customBootstrapData is missing services property", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: {
            version: "1.0",
            publication: "2025-01-15T12:00:00Z",
          } as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when services is not an array", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: {
            version: "1.0",
            publication: "2025-01-15T12:00:00Z",
            services: "not-an-array",
          } as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should throw when services is null", async () => {
      await expect(
        getRdapBaseUrlsForTld("com", {
          customBootstrapData: {
            version: "1.0",
            publication: "2025-01-15T12:00:00Z",
            services: null,
          } as unknown as BootstrapData,
        }),
      ).rejects.toThrow(
        'Invalid customBootstrapData: missing or invalid "services" array. See BootstrapData type for required structure.',
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("fallback to fetch when customBootstrapData is not provided", () => {
    beforeEach(() => {
      // Mock successful fetch response
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => validBootstrapData,
      } as Response);
    });

    it("should fetch from default IANA URL when no custom options", async () => {
      const urls = await getRdapBaseUrlsForTld("com");

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).toHaveBeenCalledWith(
        "https://data.iana.org/rdap/dns.json",
        expect.objectContaining({
          method: "GET",
          headers: { accept: "application/json" },
        }),
      );
    });

    it("should fetch from customBootstrapUrl when provided", async () => {
      const customUrl = "https://custom.example.com/bootstrap.json";
      const urls = await getRdapBaseUrlsForTld("com", {
        customBootstrapUrl: customUrl,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(fetch).toHaveBeenCalledWith(
        customUrl,
        expect.objectContaining({
          method: "GET",
          headers: { accept: "application/json" },
        }),
      );
    });

    it("should return empty array when fetch fails", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const urls = await getRdapBaseUrlsForTld("com");

      expect(urls).toEqual([]);
      expect(fetch).toHaveBeenCalled();
    });

    it("should respect signal for cancellation", async () => {
      const controller = new AbortController();
      const signal = controller.signal;

      await getRdapBaseUrlsForTld("com", { signal });

      expect(fetch).toHaveBeenCalledWith(
        "https://data.iana.org/rdap/dns.json",
        expect.objectContaining({
          signal,
        }),
      );
    });
  });

  describe("custom fetch functionality", () => {
    beforeEach(() => {
      // Reset to default fetch mock behavior
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => validBootstrapData,
      } as Response);
    });

    it("should use customFetch when provided", async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validBootstrapData,
      } as Response);

      const urls = await getRdapBaseUrlsForTld("com", { customFetch });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(customFetch).toHaveBeenCalledWith(
        "https://data.iana.org/rdap/dns.json",
        expect.objectContaining({
          method: "GET",
          headers: { accept: "application/json" },
        }),
      );
      expect(fetch).not.toHaveBeenCalled(); // global fetch should not be called
    });

    it("should pass custom fetch with customBootstrapUrl", async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validBootstrapData,
      } as Response);
      const customUrl = "https://custom.example.com/bootstrap.json";

      const urls = await getRdapBaseUrlsForTld("com", {
        customFetch,
        customBootstrapUrl: customUrl,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(customFetch).toHaveBeenCalledWith(
        customUrl,
        expect.objectContaining({
          method: "GET",
          headers: { accept: "application/json" },
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should use customFetch for caching scenario", async () => {
      let callCount = 0;
      const customFetch = vi.fn(async (_input, _init) => {
        callCount++;
        if (callCount === 1) {
          // First call - return fresh data
          return {
            ok: true,
            json: async () => validBootstrapData,
          } as Response;
        }
        // Second call - simulate cache hit (don't call global fetch)
        return {
          ok: true,
          json: async () => validBootstrapData,
        } as Response;
      });

      // First call
      const urls1 = await getRdapBaseUrlsForTld("com", { customFetch });
      expect(urls1).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(customFetch).toHaveBeenCalledTimes(1);

      // Second call with same custom fetch
      const urls2 = await getRdapBaseUrlsForTld("com", { customFetch });
      expect(urls2).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(customFetch).toHaveBeenCalledTimes(2);
    });

    it("should not use custom fetch when customBootstrapData is provided", async () => {
      const customFetch = vi.fn();

      const urls = await getRdapBaseUrlsForTld("com", {
        customBootstrapData: validBootstrapData,
        customFetch,
      });

      expect(urls).toEqual(["https://rdap.verisign.com/com/v1/"]);
      expect(customFetch).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should handle custom fetch errors", async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const urls = await getRdapBaseUrlsForTld("com", { customFetch });

      expect(urls).toEqual([]);
      expect(customFetch).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should respect signal with custom fetch", async () => {
      const controller = new AbortController();
      const signal = controller.signal;
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validBootstrapData,
      } as Response);

      await getRdapBaseUrlsForTld("com", { customFetch, signal });

      expect(customFetch).toHaveBeenCalledWith(
        "https://data.iana.org/rdap/dns.json",
        expect.objectContaining({
          signal,
        }),
      );
    });
  });
});
