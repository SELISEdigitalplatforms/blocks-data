import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { impersonationService } from "../services/impersonation.service";
import {
  useStartImpersonation,
  useStopImpersonation,
  useImpersonationStatusChecker,
} from "./use-impersonation";

vi.mock("../services/impersonation.service", () => ({
  impersonationService: {
    startImpersonation: vi.fn(),
    stopImpersonation: vi.fn(),
    impersonationStatus: vi.fn(),
  },
}));

describe("use-impersonation hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useStartImpersonation calls the service", async () => {
    vi.mocked(impersonationService.startImpersonation).mockResolvedValue(
      {} as never,
    );
    const { result } = renderHook(() => useStartImpersonation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ tenantId: "t" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(impersonationService.startImpersonation).toHaveBeenCalledWith(
      { tenantId: "t" },
      expect.anything(),
    );
  });

  it("useStopImpersonation calls the service", async () => {
    vi.mocked(impersonationService.stopImpersonation).mockResolvedValue(
      undefined,
    );
    const { result } = renderHook(() => useStopImpersonation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(impersonationService.stopImpersonation).toHaveBeenCalled();
  });

  it("useImpersonationStatusChecker fetches status", async () => {
    vi.mocked(impersonationService.impersonationStatus).mockResolvedValue({
      isImpersonated: true,
    } as never);
    const { result } = renderHook(() => useImpersonationStatusChecker(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isImpersonated: true });
  });

  it("surfaces status errors", async () => {
    vi.mocked(impersonationService.impersonationStatus).mockRejectedValue(
      new Error("boom"),
    );
    const { result } = renderHook(() => useImpersonationStatusChecker(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
