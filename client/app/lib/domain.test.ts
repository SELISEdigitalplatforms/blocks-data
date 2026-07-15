import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidDomain,
  isValidSubdomain,
  getDomain,
  getSubdomain,
  getProjectBlocksApiUrl,
} from "./domain";

describe("isValidDomain", () => {
  it("accepts well-formed http/https domains", () => {
    expect(isValidDomain("https://example.com")).toBe(true);
    expect(isValidDomain("http://sub.example.co.uk")).toBe(true);
  });

  it("rejects malformed domains", () => {
    expect(isValidDomain("example.com")).toBe(false); // missing protocol
    expect(isValidDomain("https://-bad.com")).toBe(false);
    expect(isValidDomain("not a url")).toBe(false);
  });
});

describe("isValidSubdomain", () => {
  it("validates each dotted label", () => {
    expect(isValidSubdomain("https://foo")).toBe(true);
    expect(isValidSubdomain("")).toBe(false);
  });
});

describe("getDomain", () => {
  it("returns the last two hostname labels", () => {
    expect(getDomain("https://sub.example.com")).toBe("example.com");
    expect(getDomain("https://example.co")).toBe("example.co");
  });

  it("returns empty string for invalid domains", () => {
    expect(getDomain("nope")).toBe("");
    expect(getDomain()).toBe("");
  });
});

describe("getSubdomain", () => {
  it("returns protocol + subdomain when present", () => {
    expect(getSubdomain("https://api.example.com")).toBe("https://api");
  });

  it("returns empty string when there is no subdomain", () => {
    expect(getSubdomain("https://example.com")).toBe("");
  });

  it("returns empty string for invalid/empty input", () => {
    expect(getSubdomain("")).toBe("");
    expect(getSubdomain("bad")).toBe("");
  });
});

describe("getProjectBlocksApiUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns empty string when there is no project", () => {
    expect(getProjectBlocksApiUrl(undefined)).toBe("");
  });

  it("returns empty string when the base url env is missing", () => {
    vi.stubEnv("VITE_PROJECT_DEFAULT_API_BASE_URL", "");
    expect(getProjectBlocksApiUrl({ name: "p" } as never)).toBe("");
  });

  it("returns the base url when no custom domain", () => {
    vi.stubEnv("VITE_PROJECT_DEFAULT_API_BASE_URL", "https://base.api");
    expect(getProjectBlocksApiUrl({ customDomain: "" } as never)).toBe(
      "https://base.api",
    );
  });

  it("derives blocksapi.<domain> from a custom domain", () => {
    vi.stubEnv("VITE_PROJECT_DEFAULT_API_BASE_URL", "https://base.api");
    expect(
      getProjectBlocksApiUrl({
        customDomain: "https://app.example.com",
      } as never),
    ).toBe("blocksapi.example.com");
  });
});
