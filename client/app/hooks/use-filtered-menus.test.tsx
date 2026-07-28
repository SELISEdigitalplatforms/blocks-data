import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useFilteredMenus } from "./use-filtered-menus";
import type { Menu } from "@/models/menu-models";

const wrapperFor = (path: string) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

const item = (id: string): Menu => ({ id, label: id, type: "item" }) as never;

describe("useFilteredMenus", () => {
  it("hides project-overview menus when not on a /project route", () => {
    const menus = [item("environments"), item("service-storage")];
    const { result } = renderHook(() => useFilteredMenus(menus), {
      wrapper: wrapperFor("/dashboard"),
    });
    const ids = result.current.map((m) => m.id);
    expect(ids).not.toContain("environments");
    expect(ids).toContain("service-storage");
  });

  it("hides non-project menus when on a /project route", () => {
    const menus = [item("environments"), item("service-data-gateway")];
    const { result } = renderHook(() => useFilteredMenus(menus), {
      wrapper: wrapperFor("/project/abc"),
    });
    const ids = result.current.map((m) => m.id);
    expect(ids).toContain("environments");
    expect(ids).not.toContain("service-data-gateway");
  });

  it("drops separators that are adjacent to other separators or at edges", () => {
    const sep = { id: "sep-1", type: "separator" } as never;
    const menus = [sep, item("people")];
    const { result } = renderHook(() => useFilteredMenus(menus), {
      wrapper: wrapperFor("/project/abc"),
    });
    // leading separator has no previous item -> removed
    expect(result.current.find((m) => m.id === "sep-1")).toBeUndefined();
  });

  it("keeps a valid separator sandwiched between two items", () => {
    const menus = [
      item("service-storage"),
      { id: "sep-mid", type: "separator" } as never,
      item("service-data-gateway"),
    ];
    const { result } = renderHook(() => useFilteredMenus(menus), {
      wrapper: wrapperFor("/dashboard"),
    });
    expect(result.current.find((m) => m.id === "sep-mid")).toBeDefined();
  });
});
