import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useItemSelection } from "./use-item-selection";

describe("useItemSelection", () => {
  it("toggle adds and removes by kind", () => {
    const { result } = renderHook(() => useItemSelection("root|"));

    act(() => result.current.toggle("f1", "file"));
    act(() => result.current.toggle("d1", "directory"));

    expect([...result.current.fileIds]).toEqual(["f1"]);
    expect([...result.current.directoryIds]).toEqual(["d1"]);
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected("f1")).toBe(true);
    expect(result.current.isSelected("d1")).toBe(true);

    act(() => result.current.toggle("f1", "file"));

    expect(result.current.fileIds.size).toBe(0);
    expect(result.current.isSelected("f1")).toBe(false);
    expect(result.current.count).toBe(1);
  });

  it("setAll selects and deselects only the given items", () => {
    const { result } = renderHook(() => useItemSelection("root|"));

    act(() => result.current.toggle("keep", "file"));
    act(() =>
      result.current.setAll(
        [
          { id: "d1", kind: "directory" },
          { id: "d2", kind: "directory" },
        ],
        true,
      ),
    );

    expect([...result.current.directoryIds].sort()).toEqual(["d1", "d2"]);
    expect(result.current.count).toBe(3);

    act(() =>
      result.current.setAll(
        [
          { id: "d1", kind: "directory" },
          { id: "d2", kind: "directory" },
        ],
        false,
      ),
    );

    expect(result.current.directoryIds.size).toBe(0);
    expect([...result.current.fileIds]).toEqual(["keep"]);
    expect(result.current.count).toBe(1);
  });

  it("changing resetKey clears the selection", () => {
    const { result, rerender } = renderHook(({ key }) => useItemSelection(key), {
      initialProps: { key: "root|" },
    });

    act(() => result.current.toggle("f1", "file"));
    act(() => result.current.toggle("d1", "directory"));
    expect(result.current.count).toBe(2);

    rerender({ key: "fold-1|" });

    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("f1")).toBe(false);

    // Selecting again after the reset starts from an empty selection.
    act(() => result.current.toggle("f2", "file"));
    expect([...result.current.fileIds]).toEqual(["f2"]);
  });

  it("clear empties both lists", () => {
    const { result } = renderHook(() => useItemSelection("root|"));

    act(() => result.current.toggle("f1", "file"));
    act(() => result.current.toggle("d1", "directory"));
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
    expect(result.current.fileIds.size).toBe(0);
    expect(result.current.directoryIds.size).toBe(0);
  });
});
