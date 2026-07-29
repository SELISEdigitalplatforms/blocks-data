import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useContext } from "react";
import { MemoryRouter } from "react-router";
import {
  DashboardLayoutProvider,
  SidebarContext,
} from "./dashboard-layout-provider";

function makeWrapper(
  props: Partial<React.ComponentProps<typeof DashboardLayoutProvider>> = {},
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[(props as { path?: string }).path ?? "/"]}>
        <DashboardLayoutProvider isOpen={props.isOpen ?? true} {...props}>
          {children}
        </DashboardLayoutProvider>
      </MemoryRouter>
    );
  };
}

const renderSidebar = (
  props?: Partial<React.ComponentProps<typeof DashboardLayoutProvider>>,
) =>
  renderHook(() => useContext(SidebarContext), {
    wrapper: makeWrapper(props),
  });

describe("DashboardLayoutProvider", () => {
  beforeEach(() => {
    // desktop viewport so isMobile stays false
    Object.defineProperty(window, "innerWidth", {
      value: 1280,
      configurable: true,
      writable: true,
    });
    localStorage.clear();
  });

  it("toggles the sidebar and persists when persist is enabled", () => {
    const { result } = renderSidebar({ isOpen: false, persist: true });
    // effect: not persist? persist true; desktop => reads storage (none) so stays false
    expect(result.current.isSidebarOpen).toBe(false);

    act(() => result.current.toggleSidebar());
    expect(result.current.isSidebarOpen).toBe(true);
    expect(localStorage.getItem("sidebar-open")).toBe("true");

    act(() => result.current.closeSidebar());
    expect(result.current.isSidebarOpen).toBe(false);
    expect(localStorage.getItem("sidebar-open")).toBe("false");
  });

  it("closeWithoutPersist closes without writing storage", () => {
    const { result } = renderSidebar({ isOpen: true, persist: true });
    localStorage.removeItem("sidebar-open");
    act(() => result.current.closeWithoutPersist());
    expect(result.current.isSidebarOpen).toBe(false);
    expect(localStorage.getItem("sidebar-open")).toBeNull();
  });

  it("manages the submenu open state", () => {
    const { result } = renderSidebar({ isOpen: false });
    act(() => result.current.toggleSidebarSubMenu());
    expect(result.current.isSidebarSubMenuOpen).toBe(true);
    act(() => result.current.toggleSidebarSubMenu());
    expect(result.current.isSidebarSubMenuOpen).toBe(false);
    act(() => result.current.showSidebarSubMenu());
    expect(result.current.isSidebarSubMenuOpen).toBe(true);
  });

  it("updateSubMenuId stores the id and clears the search term", () => {
    const { result } = renderSidebar();
    act(() => result.current.updateServicesSearchTerm("query"));
    expect(result.current.servicesSearchTerm).toBe("query");

    act(() => result.current.updateSubMenuId("menu-1"));
    expect(result.current.subMenuId).toBe("menu-1");
    expect(localStorage.getItem("subMenuId")).toBe("menu-1");
    expect(result.current.servicesSearchTerm).toBe("");
  });

  it("restores isSidebarOpen from storage on mount when persisting", () => {
    localStorage.setItem("sidebar-open", "true");
    const { result } = renderSidebar({ isOpen: false, persist: true });
    expect(result.current.isSidebarOpen).toBe(true);
  });
});
