import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./use-debounce";
import { useCountDown } from "./use-count-down";
import { useCopyToClipboard } from "./use-copy-to-clipboard";
import useIsMobile from "./use-is-mobile";
import { useActiveFiltersCount } from "./use-active-filters-count";
import usePopoverWidth from "./use-popover-width";

describe("useDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately then the debounced value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );
    expect(result.current).toBe("a");

    rerender({ value: "b" });
    expect(result.current).toBe("a"); // not yet updated

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("b");
  });
});

describe("useCountDown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down each second", () => {
    const { result } = renderHook(() => useCountDown(3));
    expect(result.current.remainingTime).toBe(3);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remainingTime).toBe(1);
  });

  it("stops at zero", () => {
    const { result } = renderHook(() => useCountDown(1));
    // step so the effect re-runs and the <= 0 guard clears the interval
    act(() => vi.advanceTimersByTime(1000)); // 1 -> 0
    act(() => vi.advanceTimersByTime(3000)); // stays 0
    expect(result.current.remainingTime).toBe(0);
  });

  it("reset restores the timer", () => {
    const { result } = renderHook(() => useCountDown(5));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.reset());
    expect(result.current.remainingTime).toBe(5);
    act(() => result.current.reset(10));
    expect(result.current.remainingTime).toBe(10);
  });
});

describe("useCopyToClipboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("copies text and calls onSuccess", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("hello", onSuccess);
    });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("calls onError when the clipboard API is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const onError = vi.fn();

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("hello", undefined, onError);
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("calls onError when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const onError = vi.fn();

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("x", undefined, onError);
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("useIsMobile", () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, "innerWidth", {
      value: w,
      configurable: true,
      writable: true,
    });
  };

  it("is true when the viewport is at or below the breakpoint", () => {
    setWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("is false on wide viewports and reacts to resize", () => {
    setWidth(1200);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWidth(400);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);
  });
});

describe("useActiveFiltersCount", () => {
  const makeTable = (columnFilters: unknown[]) =>
    ({ getState: () => ({ columnFilters }) }) as never;

  it("counts scalar, array, object and search-type filters plus date range", () => {
    const table = makeTable([
      { id: "name", value: "abc" }, // scalar => 1
      { id: "tags", value: ["a", "b"] }, // array => 2
      { id: "meta", value: { x: 1, y: 2 } }, // object => 2
      { id: "search", value: { types: ["t1", "t2", "t3"] } }, // search types => 3
    ]);
    const { result } = renderHook(() =>
      useActiveFiltersCount(table, { from: new Date() }, "search"),
    );
    // 1 (scalar) + 2 (array) + 2 (object) + 3 (search types) + 1 (date) = 9
    expect(result.current).toBe(9);
  });

  it("ignores empty/undefined scalar values", () => {
    const table = makeTable([
      { id: "a", value: "" },
      { id: "b", value: undefined },
    ]);
    const { result } = renderHook(() =>
      useActiveFiltersCount(table, undefined, undefined),
    );
    expect(result.current).toBe(0);
  });
});

describe("usePopoverWidth", () => {
  it("returns a ref and reads offsetWidth on mount", async () => {
    const { result } = renderHook(() => usePopoverWidth());
    const [ref] = result.current;
    const el = document.createElement("button");
    Object.defineProperty(el, "offsetWidth", { value: 240, configurable: true });
    (ref as { current: HTMLButtonElement | null }).current = el;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => expect(result.current[1]).toBe(240));
  });
});
