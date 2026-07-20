import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { AuthService } from "./auth.service";
import { AUTH_ENDPOINTS, AUTH_OIDC_ENDPOINTS } from "../constants/endpoint.constant";
import { PEOPLE_ENDPOINTS, PROJECT_ENDPOINTS } from "@/identifier/constants/endpoint.constant";
import {
  mockSigninPayload,
  mockSigninResponse,
  mockSignupPayload,
  mockSignupResponse,
  mockVerifyMfaPayload,
  mockVerifyMfaResponse,
} from "../../test-utils/__mocks__";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { useImpersonateStore } from "@/store/impersonate-store";
import { useAuthStore } from "@/store/use-auth-store";
import { impersonationService } from "@/services/impersonation.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: vi.fn(() => "") }));
vi.mock("@/store/impersonate-store", () => ({
  useImpersonateStore: { getState: vi.fn(() => ({ isImpersonated: false })) },
}));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: { getState: vi.fn(() => ({ refreshToken: "rt-123" })) },
}));
vi.mock("@/services/impersonation.service", () => ({
  impersonationService: { stopImpersonation: vi.fn(() => Promise.resolve()) },
}));

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── signinByEmail ──────────────────────────────────────────────────────────
  describe("signinByEmail", () => {
    it("should POST form-encoded credentials to TOKEN endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue(mockSigninResponse);

      const result = await service.signinByEmail(mockSigninPayload);

      expect(http.post).toHaveBeenCalledWith(
        AUTH_ENDPOINTS.TOKEN,
        expect.any(URLSearchParams),
        { "Content-Type": "application/x-www-form-urlencoded" },
        { skipTokenRotation: true },
      );

      const body = vi.mocked(http.post).mock.calls[0][1] as URLSearchParams;
      expect(body.get("grant_type")).toBe("password");
      expect(body.get("username")).toBe(mockSigninPayload.username);
      expect(body.get("password")).toBe(mockSigninPayload.password);
      expect(result).toEqual(mockSigninResponse);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));

      await expect(service.signinByEmail(mockSigninPayload)).rejects.toThrow("Network error");
    });

    it("should append the optional OIDC parameters when provided", async () => {
      vi.mocked(http.post).mockResolvedValue(mockSigninResponse);

      await service.signinByEmail({
        ...mockSigninPayload,
        clientId: "client-1",
        state: "state-1",
        nonce: "nonce-1",
        scope: "openid profile",
        redirectUri: "https://app/cb",
      });

      const body = vi.mocked(http.post).mock.calls[0][1] as URLSearchParams;
      expect(body.get("client_id")).toBe("client-1");
      expect(body.get("state")).toBe("state-1");
      expect(body.get("nonce")).toBe("nonce-1");
      expect(body.get("scope")).toBe("openid profile");
      expect(body.get("redirect_uri")).toBe("https://app/cb");
    });
  });

  // ─── getLoginOptions ──────────────────────────────────────────────────────
  describe("getLoginOptions", () => {
    it("should GET the login options endpoint", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: {} });

      await service.getLoginOptions();

      expect(http.get).toHaveBeenCalledWith(PROJECT_ENDPOINTS.GET_LOGIN_OPTIONS);
    });
  });

  // ─── verifyOidc ───────────────────────────────────────────────────────────
  describe("verifyOidc", () => {
    it("should POST an authorization_code grant to the OIDC token endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue(mockVerifyMfaResponse);

      await service.verifyOidc({ code: "abc", state: "xyz" });

      expect(http.post).toHaveBeenCalledWith(
        AUTH_OIDC_ENDPOINTS.OIDC_TOKEN,
        expect.any(URLSearchParams),
        { "Content-Type": "application/x-www-form-urlencoded" },
        { skipTokenRotation: true },
      );
      const body = vi.mocked(http.post).mock.calls[0][1] as URLSearchParams;
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("abc");
      expect(body.get("state")).toBe("xyz");
    });
  });

  // ─── verifyMfa ──────────────────────────────────────────────────────────────
  describe("verifyMfa", () => {
    it("should POST form-encoded MFA payload to TOKEN endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue(mockVerifyMfaResponse);

      const result = await service.verifyMfa(mockVerifyMfaPayload);

      expect(http.post).toHaveBeenCalledWith(AUTH_ENDPOINTS.TOKEN, expect.any(URLSearchParams), {
        "Content-Type": "application/x-www-form-urlencoded",
      });

      const body = vi.mocked(http.post).mock.calls[0][1] as URLSearchParams;
      expect(body.get("grant_type")).toBe("mfa_code");
      expect(body.get("code")).toBe(mockVerifyMfaPayload.code);
      expect(body.get("mfa_id")).toBe(mockVerifyMfaPayload.mfa_id);
      expect(body.get("mfa_type")).toBe(mockVerifyMfaPayload.mfa_type.toString());
      expect(result).toEqual(mockVerifyMfaResponse);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));

      await expect(service.verifyMfa(mockVerifyMfaPayload)).rejects.toThrow("Network error");
    });
  });

  // ─── signupByEmail ──────────────────────────────────────────────────────────
  describe("signupByEmail", () => {
    it("should POST to the SIGNUP endpoint with payload", async () => {
      vi.mocked(http.post).mockResolvedValue(mockSignupResponse);

      const result = await service.signupByEmail(mockSignupPayload);

      expect(http.post).toHaveBeenCalledWith(PEOPLE_ENDPOINTS.SIGNUP, mockSignupPayload);
      expect(result).toEqual(mockSignupResponse);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));

      await expect(service.signupByEmail(mockSignupPayload)).rejects.toThrow("Network error");
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────
  describe("logout", () => {
    it("should POST to the LOGOUT endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue(undefined);

      await service.logout();

      expect(http.post).toHaveBeenCalledWith(
        AUTH_ENDPOINTS.LOGOUT,
        { refreshToken: "" },
        undefined,
        { absoluteUrl: true },
      );
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));

      await expect(service.logout()).rejects.toThrow("Network error");
    });

    it("forwards the stored refresh token on localhost and stops active impersonation", async () => {
      vi.mocked(getRuntimeEnv).mockReturnValue("http://localhost:5000");
      vi.mocked(useImpersonateStore.getState).mockReturnValue({
        isImpersonated: true,
      } as never);
      vi.mocked(http.post).mockResolvedValue(undefined);

      await service.logout();

      expect(impersonationService.stopImpersonation).toHaveBeenCalled();
      expect(http.post).toHaveBeenCalledWith(
        AUTH_ENDPOINTS.LOGOUT,
        { refreshToken: "rt-123" },
        undefined,
        { absoluteUrl: true },
      );
    });

    it("swallows errors thrown while stopping impersonation", async () => {
      vi.mocked(getRuntimeEnv).mockReturnValue("http://localhost:5000");
      vi.mocked(useImpersonateStore.getState).mockReturnValue({
        isImpersonated: true,
      } as never);
      vi.mocked(impersonationService.stopImpersonation).mockRejectedValueOnce(
        new Error("stop failed"),
      );
      vi.mocked(http.post).mockResolvedValue(undefined);

      await expect(service.logout()).resolves.not.toThrow();
      expect(http.post).toHaveBeenCalled();
    });
  });
});
