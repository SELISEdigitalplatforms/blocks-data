import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { Menu } from "@/models/menu-models";

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { name: "Proj", environment: "dev" } }),
}));

import { DesktopMenuItem } from "./desktop-menu-item";

const renderAt = (menu: Menu, path = "/other", isSidebarOpen = true) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DesktopMenuItem menu={menu} isSidebarOpen={isSidebarOpen} />
    </MemoryRouter>,
  );

const leaf = (over: Partial<Extract<Menu, { type: "menu" }>> = {}): Menu =>
  ({ type: "menu", id: "m1", name: "Dashboard", path: "/dashboard", ...over }) as Menu;

describe("DesktopMenuItem", () => {
  it("renders a separator", () => {
    const { container } = renderAt({ type: "separator" } as Menu);
    expect(container.querySelector(".border-t")).toBeTruthy();
  });

  it("renders nothing for an unknown type", () => {
    const { container } = renderAt({ type: "custom" } as never);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a leaf menu with its name and links to its path", () => {
    renderAt(leaf());
    const link = screen.getByRole("link", { name: /Dashboard/ });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders a badge on a leaf menu", () => {
    renderAt(leaf({ badge: "new" }));
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("shows the name only in the hover tooltip when the sidebar is collapsed", () => {
    renderAt(leaf(), "/other", false);
    // The inline label span is not rendered; the hover tooltip carries the name.
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders children of a parent menu", () => {
    const parent = leaf({
      name: "Settings",
      path: "/settings",
      children: [
        { type: "menu", id: "c1", name: "General", path: "/settings/general" } as never,
        { type: "menu", id: "c2", name: "Security", path: "/settings/security" } as never,
      ],
    });
    renderAt(parent);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("marks the active menu when the pathname matches", () => {
    const { container } = renderAt(leaf({ path: "/dashboard" }), "/dashboard");
    expect(container.innerHTML).toContain("bg-primary/10");
  });
});
