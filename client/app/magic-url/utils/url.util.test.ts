import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  getDefaultShortUrlBase,
  isValidUrl,
  magicUrlSchema,
} from "./url.util";
import { SHORT_URL_BASES } from "@/magic-url/constants/endpoint.constant";

// getDefaultShortUrlBase resolves the short-url host from BLOCKS_DATA_BASE_URL.
// Default the mock to "" so modules that read runtime env at load time are safe.
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: vi.fn(() => ""),
}));

describe("url.util", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getDefaultShortUrlBase ─────────────────────────────────────────────────
  describe("getDefaultShortUrlBase", () => {
    it("should return the dev short-url base for a dev API host", () => {
      vi.mocked(getRuntimeEnv).mockReturnValue(
        "https://dev-api.blocksdevelopers.com",
      );
      expect(getDefaultShortUrlBase()).toBe(SHORT_URL_BASES.dev);
    });

    it("should return the stg short-url base for a stg API host", () => {
      // Note: a host containing "dev" (e.g. blocksdevelopers) would match dev
      // first, so use a stg host without that substring.
      vi.mocked(getRuntimeEnv).mockReturnValue(
        "https://stg-data.seliseblocks.com",
      );
      expect(getDefaultShortUrlBase()).toBe(SHORT_URL_BASES.stg);
    });

    it("should fall back to the prod short-url base for a prod host", () => {
      vi.mocked(getRuntimeEnv).mockReturnValue("https://api.seliseblocks.com");
      expect(getDefaultShortUrlBase()).toBe(SHORT_URL_BASES.prod);
    });

    it("should fall back to prod when the env value is empty", () => {
      vi.mocked(getRuntimeEnv).mockReturnValue("");
      expect(getDefaultShortUrlBase()).toBe(SHORT_URL_BASES.prod);
    });
  });

  // ─── isValidUrl ─────────────────────────────────────────────────────────────
  describe("isValidUrl", () => {
    it("should accept http and https URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://example.com/path?q=1")).toBe(true);
    });

    it("should reject non-http(s) protocols", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("mailto:test@example.com")).toBe(false);
    });

    it("should reject malformed or empty strings", () => {
      expect(isValidUrl("not a url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  // ─── magicUrlSchema ─────────────────────────────────────────────────────────
  describe("magicUrlSchema", () => {
    it("should accept a valid uri and name", () => {
      const result = magicUrlSchema.safeParse({
        uri: "https://example.com",
        name: "My link",
      });
      expect(result.success).toBe(true);
    });

    it("should accept a uri without protocol", () => {
      const result = magicUrlSchema.safeParse({
        uri: "example.com",
        name: "No protocol",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an empty uri", () => {
      const result = magicUrlSchema.safeParse({ uri: "", name: "x" });
      expect(result.success).toBe(false);
    });

    it("should reject a malformed uri", () => {
      const result = magicUrlSchema.safeParse({ uri: "###", name: "x" });
      expect(result.success).toBe(false);
    });

    it("should reject an empty name", () => {
      const result = magicUrlSchema.safeParse({
        uri: "https://example.com",
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject a name longer than 100 characters", () => {
      const result = magicUrlSchema.safeParse({
        uri: "https://example.com",
        name: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });
});
