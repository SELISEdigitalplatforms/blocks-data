import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  reducer,
  toast,
  useToast,
  showSuccessToast,
  showInfoToast,
  showErrorToast,
} from "./use-toast";

const baseToast = { id: "1", title: "T", open: true } as never;

describe("use-toast reducer", () => {
  it("ADD_TOAST prepends and enforces the toast limit of 1", () => {
    let state = reducer({ toasts: [] }, { type: "ADD_TOAST", toast: baseToast });
    expect(state.toasts).toHaveLength(1);
    state = reducer(state, {
      type: "ADD_TOAST",
      toast: { id: "2", open: true } as never,
    });
    // limit is 1, newest kept first
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe("2");
  });

  it("UPDATE_TOAST merges matching toast", () => {
    const state = reducer(
      { toasts: [baseToast] },
      { type: "UPDATE_TOAST", toast: { id: "1", title: "New" } as never },
    );
    expect(state.toasts[0].title).toBe("New");
  });

  it("DISMISS_TOAST closes a specific toast", () => {
    const state = reducer(
      { toasts: [baseToast] },
      { type: "DISMISS_TOAST", toastId: "1" },
    );
    expect(state.toasts[0].open).toBe(false);
  });

  it("DISMISS_TOAST with no id closes all toasts", () => {
    const state = reducer(
      { toasts: [baseToast, { id: "2", open: true } as never] },
      { type: "DISMISS_TOAST" },
    );
    expect(state.toasts.every((t) => t.open === false)).toBe(true);
  });

  it("REMOVE_TOAST removes a specific toast", () => {
    const state = reducer(
      { toasts: [baseToast, { id: "2", open: true } as never] },
      { type: "REMOVE_TOAST", toastId: "1" },
    );
    expect(state.toasts.map((t) => t.id)).toEqual(["2"]);
  });

  it("REMOVE_TOAST with no id clears all", () => {
    const state = reducer(
      { toasts: [baseToast] },
      { type: "REMOVE_TOAST", toastId: undefined },
    );
    expect(state.toasts).toEqual([]);
  });
});

describe("toast() and useToast()", () => {
  it("adds a toast observable through the hook and returns controls", () => {
    const { result } = renderHook(() => useToast());
    let handle: ReturnType<typeof toast>;
    act(() => {
      handle = result.current.toast({ title: "Hello" } as never);
    });
    expect(result.current.toasts[0]?.title).toBe("Hello");
    expect(handle!.id).toBeDefined();

    act(() => handle!.update({ ...result.current.toasts[0], title: "Bye" }));
    expect(result.current.toasts[0]?.title).toBe("Bye");

    act(() => handle!.dismiss());
    expect(result.current.toasts[0]?.open).toBe(false);
  });

  it("dismiss() from the hook closes toasts", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: "X" } as never);
    });
    act(() => result.current.dismiss());
    expect(result.current.toasts[0]?.open).toBe(false);
  });
});

describe("show*Toast helpers", () => {
  it("showSuccessToast uses the success variant and default title", () => {
    const { result } = renderHook(() => useToast());
    act(() => showSuccessToast({ description: "done" }));
    expect(result.current.toasts[0]?.variant).toBe("success");
    expect(result.current.toasts[0]?.title).toBe("Success");
  });

  it("showInfoToast uses the info variant", () => {
    const { result } = renderHook(() => useToast());
    act(() => showInfoToast({ description: "fyi", title: "Note" }));
    expect(result.current.toasts[0]?.variant).toBe("info");
    expect(result.current.toasts[0]?.title).toBe("Note");
  });

  it("showErrorToast uses the destructive variant", () => {
    const { result } = renderHook(() => useToast());
    act(() => showErrorToast({ errors: "something broke" }));
    expect(result.current.toasts[0]?.variant).toBe("destructive");
    expect(result.current.toasts[0]?.title).toBe("Failed");
  });
});
