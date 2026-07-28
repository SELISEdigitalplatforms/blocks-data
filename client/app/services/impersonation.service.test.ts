import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { IMPERSONATE_ENDPOINTS } from "@/idp/authentication/constants";
import { impersonationService } from "./impersonation.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("impersonationService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("startImpersonation posts the request with absolute url", async () => {
    vi.mocked(http.post).mockResolvedValue({ rootTenantId: "r" });
    const req = { targeted_tenant_id: "t1" };
    const res = await impersonationService.startImpersonation(req);
    expect(http.post).toHaveBeenCalledWith(
      IMPERSONATE_ENDPOINTS.IMPERSONATE,
      req,
      undefined,
      { absoluteUrl: true },
    );
    expect(res).toEqual({ rootTenantId: "r" });
  });

  it("stopImpersonation posts an empty body", async () => {
    vi.mocked(http.post).mockResolvedValue(undefined);
    await impersonationService.stopImpersonation();
    expect(http.post).toHaveBeenCalledWith(
      IMPERSONATE_ENDPOINTS.STOP_IMPERSONATION,
      {},
      undefined,
      { absoluteUrl: true },
    );
  });

  it("impersonationStatus posts null and returns the status", async () => {
    vi.mocked(http.post).mockResolvedValue({ impersonated: false });
    const res = await impersonationService.impersonationStatus();
    expect(http.post).toHaveBeenCalledWith(
      IMPERSONATE_ENDPOINTS.IMPERSONATION_STATUS,
      null,
      undefined,
      { absoluteUrl: true },
    );
    expect(res).toEqual({ impersonated: false });
  });
});
