import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { serviceRegistryService } from "@/identifier/services/service-registery.service";
import { useRegisterService, useGetAllServices } from "./use-services";

vi.mock("@/identifier/services/service-registery.service", () => ({
  serviceRegistryService: {
    registerService: vi.fn(),
    getAllServices: vi.fn(),
  },
}));

describe("use-services hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("useRegisterService registers a service", async () => {
    vi.mocked(serviceRegistryService.registerService).mockResolvedValue({
      isSuccess: true,
    } as never);
    const { result } = renderHook(() => useRegisterService(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ serviceName: "svc" } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceRegistryService.registerService).toHaveBeenCalledWith({
      serviceName: "svc",
    });
  });

  it("useGetAllServices fetches when a projectKey is present", async () => {
    vi.mocked(serviceRegistryService.getAllServices).mockResolvedValue({
      services: [],
    } as never);
    const { result } = renderHook(
      () => useGetAllServices({ projectKey: "p", page: 0, pageSize: 10 } as never),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceRegistryService.getAllServices).toHaveBeenCalled();
  });

  it("useGetAllServices is disabled without a projectKey", () => {
    const { result } = renderHook(
      () => useGetAllServices({ projectKey: "", page: 0, pageSize: 10 } as never),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(serviceRegistryService.getAllServices).not.toHaveBeenCalled();
  });
});
