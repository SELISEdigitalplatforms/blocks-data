import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirectToLogin, buildNavigationUrl } from "./oidc-navigation.util";

describe("oidc-navigation.util", () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hrefSetter = vi.fn();

    Object.defineProperty(window, "location", {
      value: {
        search: "",
        hash: "",
        href: "http://localhost:3000/oidc/consent",
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.location, "href", {
      set: hrefSetter as (v: string) => void,
      get: () => "http://localhost:3000/oidc/consent",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── redirectToLogin ──────────────────────────────────────────────────────
  describe("redirectToLogin", () => {
    it("should redirect to /oidc/login with current query params", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key&clientId=client-123",
          hash: "",
          href: "http://localhost:3000/oidc/consent?x-blocks-key=test-key&clientId=client-123",
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window.location, "href", {
        set: hrefSetter as (v: string) => void,
        get: () => "http://localhost:3000/oidc/consent?x-blocks-key=test-key&clientId=client-123",
        configurable: true,
      });

      redirectToLogin();

      expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining("/oidc/login?"));
      const redirectUrl = hrefSetter.mock.calls[0][0] as string;
      expect(redirectUrl).toContain("x-blocks-key=test-key");
      expect(redirectUrl).toContain("clientId=client-123");
    });

    it("should extract brandColor from hash fragment", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key",
          hash: "#FF0000&logoUrl=https://cdn.test.com/logo.png",
          href: "http://localhost:3000/oidc/consent?x-blocks-key=test-key#FF0000&logoUrl=https://cdn.test.com/logo.png",
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window.location, "href", {
        set: hrefSetter as (v: string) => void,
        get: () =>
          "http://localhost:3000/oidc/consent?x-blocks-key=test-key#FF0000&logoUrl=https://cdn.test.com/logo.png",
        configurable: true,
      });

      redirectToLogin();

      expect(hrefSetter).toHaveBeenCalled();
      const redirectUrl = hrefSetter.mock.calls[0][0] as string;
      expect(redirectUrl).toContain("brandColor=");
      expect(redirectUrl).toContain("logoUrl=");
    });

    it("merges a non-color hash fragment as plain query params", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key",
          hash: "#state=abc&nonce=def",
          href: "http://localhost:3000/oidc/consent?x-blocks-key=test-key#state=abc&nonce=def",
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window.location, "href", {
        set: hrefSetter as (v: string) => void,
        get: () => "http://localhost:3000/oidc/consent",
        configurable: true,
      });

      redirectToLogin();

      const redirectUrl = hrefSetter.mock.calls[0][0] as string;
      expect(redirectUrl).toContain("state=abc");
      expect(redirectUrl).toContain("nonce=def");
    });

    it("percent-encodes a decoded '#' brandColor already present in the query", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?brandColor=%23AABBCC",
          hash: "",
          href: "http://localhost:3000/oidc/consent?brandColor=%23AABBCC",
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window.location, "href", {
        set: hrefSetter as (v: string) => void,
        get: () => "http://localhost:3000/oidc/consent",
        configurable: true,
      });

      redirectToLogin();

      const redirectUrl = hrefSetter.mock.calls[0][0] as string;
      // "#AABBCC" is encodeURIComponent'd to "%23AABBCC", then URLSearchParams
      // re-encodes the leading "%" when serializing → "%2523AABBCC".
      expect(redirectUrl).toContain("brandColor=%2523AABBCC");
    });
  });

  // ─── buildNavigationUrl ───────────────────────────────────────────────────
  describe("buildNavigationUrl", () => {
    it("should build URL for target path with current query params", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key&clientId=client-123",
          hash: "",
          href: "http://localhost:3000/oidc/login?x-blocks-key=test-key&clientId=client-123",
        },
        writable: true,
        configurable: true,
      });

      const url = buildNavigationUrl("/oidc/consent");

      expect(url).toContain("/oidc/consent?");
      expect(url).toContain("x-blocks-key=test-key");
      expect(url).toContain("clientId=client-123");
    });

    it("should extract brandColor from hash and include in URL", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key",
          hash: "#124091&clientId=client-from-hash",
          href: "http://localhost:3000/oidc/login?x-blocks-key=test-key#124091&clientId=client-from-hash",
        },
        writable: true,
        configurable: true,
      });

      const url = buildNavigationUrl("/oidc/recover");

      expect(url).toContain("/oidc/recover?");
      expect(url).toContain("brandColor=");
      expect(url).toContain("clientId=client-from-hash");
    });

    it("should handle URL with no params", () => {
      const url = buildNavigationUrl("/oidc/login");
      expect(url).toContain("/oidc/login?");
    });

    it("merges a non-color hash fragment into the target URL", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?x-blocks-key=test-key",
          hash: "#state=s1&scope=openid",
          href: "http://localhost:3000/oidc/login?x-blocks-key=test-key#state=s1&scope=openid",
        },
        writable: true,
        configurable: true,
      });

      const url = buildNavigationUrl("/oidc/consent");
      expect(url).toContain("state=s1");
      expect(url).toContain("scope=openid");
    });

    it("recovers brandColor from the raw href when it is missing from params and hash", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "",
          hash: "",
          href: "http://localhost:3000/oidc/login?brandColor=00ff00",
        },
        writable: true,
        configurable: true,
      });

      const url = buildNavigationUrl("/oidc/consent");
      expect(url).toContain("brandColor=00ff00");
    });

    it("percent-encodes a '#' brandColor before appending it", () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?brandColor=%23112233",
          hash: "",
          href: "http://localhost:3000/oidc/login?brandColor=%23112233",
        },
        writable: true,
        configurable: true,
      });

      const url = buildNavigationUrl("/oidc/consent");
      // Same double-encoding path as redirectToLogin: "%23112233" → decoded
      // "#112233" → re-encoded "%23112233" → serialized "%2523112233".
      expect(url).toContain("brandColor=%2523112233");
    });
  });
});
