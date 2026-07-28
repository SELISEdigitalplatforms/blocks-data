import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useReadonlyExpanded } from "./use-readonly-expanded";

describe("useReadonlyExpanded", () => {
  // Reset the module-level shared state after each test so ordering is stable.
  afterEach(() => {
    const { result } = renderHook(() => useReadonlyExpanded());
    act(() => result.current[1](false));
  });

  it("should start collapsed by default", () => {
    const { result } = renderHook(() => useReadonlyExpanded());
    expect(result.current[0]).toBe(false);
  });

  it("should expand when setExpanded(true) is called", () => {
    const { result } = renderHook(() => useReadonlyExpanded());

    act(() => result.current[1](true));

    expect(result.current[0]).toBe(true);
  });

  it("should collapse again when setExpanded(false) is called", () => {
    const { result } = renderHook(() => useReadonlyExpanded());

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("should share state across separate hook instances", () => {
    const first = renderHook(() => useReadonlyExpanded());
    const second = renderHook(() => useReadonlyExpanded());

    act(() => first.result.current[1](true));

    expect(first.result.current[0]).toBe(true);
    expect(second.result.current[0]).toBe(true);
  });

  it("should seed a newly mounted hook with the current shared value", () => {
    const first = renderHook(() => useReadonlyExpanded());
    act(() => first.result.current[1](true));

    const late = renderHook(() => useReadonlyExpanded());
    expect(late.result.current[0]).toBe(true);
  });
});
