import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNotificationListener } from "./use-notification-listener";

describe("useNotificationListener", () => {
  it("invokes the callback with the event detail", () => {
    const cb = vi.fn();
    renderHook(() => useNotificationListener<{ x: number }>("blocks:evt", cb));

    window.dispatchEvent(
      new CustomEvent("blocks:evt", { detail: { x: 42 } }),
    );

    expect(cb).toHaveBeenCalledWith({ x: 42 });
  });

  it("removes the listener on unmount", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() =>
      useNotificationListener("blocks:evt2", cb),
    );

    unmount();
    window.dispatchEvent(new CustomEvent("blocks:evt2", { detail: 1 }));
    expect(cb).not.toHaveBeenCalled();
  });
});
