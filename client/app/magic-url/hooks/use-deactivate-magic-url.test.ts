import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { toast } from "@/hooks/use-toast";
import { useRemoveMagicUrl } from "./use-magic-url";
import { useDeactivateMagicUrl } from "./use-deactivate-magic-url";

vi.mock("./use-magic-url", () => ({
  useRemoveMagicUrl: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("useDeactivateMagicUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call removeMagicUrl with the wrapped linkIds and success/error handlers", () => {
    const mutate = vi.fn();
    vi.mocked(useRemoveMagicUrl).mockReturnValue({
      mutate,
      isPending: false,
    } as never);

    const { result } = renderHook(() => useDeactivateMagicUrl(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.deactivateMagicUrl("item-1", "pk"));

    expect(mutate).toHaveBeenCalledWith(
      { linkIds: ["item-1"], projectKey: "pk" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("should show a success toast and invoke the callback on success", () => {
    const mutate = vi.fn((_vars, opts) => opts.onSuccess());
    vi.mocked(useRemoveMagicUrl).mockReturnValue({
      mutate,
      isPending: false,
    } as never);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeactivateMagicUrl(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.deactivateMagicUrl("item-1", "pk", onSuccess));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "Magic URL deactivated successfully",
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("should show a destructive toast on error", () => {
    const mutate = vi.fn((_vars, opts) => opts.onError());
    vi.mocked(useRemoveMagicUrl).mockReturnValue({
      mutate,
      isPending: false,
    } as never);

    const { result } = renderHook(() => useDeactivateMagicUrl(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.deactivateMagicUrl("item-1", "pk"));

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Failed to deactivate Magic URL",
      }),
    );
  });

  it("should expose the pending state as isRemoving", () => {
    vi.mocked(useRemoveMagicUrl).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as never);

    const { result } = renderHook(() => useDeactivateMagicUrl(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isRemoving).toBe(true);
  });
});
