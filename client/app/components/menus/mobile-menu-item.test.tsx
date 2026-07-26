import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Menu } from "@/models/menu-models";

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { name: "Proj", environment: "dev" } }),
}));

import { MobileMenuItem } from "./mobile-menu-item";

const renderAt = (menu: Menu, onClick = vi.fn(), path = "/other") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileMenuItem menu={menu} onClick={onClick} />
    </MemoryRouter>,
  );

const leaf = (over: Partial<Extract<Menu, { type: "menu" }>> = {}): Menu =>
  ({ type: "menu", id: "m1", name: "Dashboard", path: "/dashboard", ...over }) as Menu;

describe("MobileMenuItem", () => {
  it("renders a separator", () => {
    const { container } = renderAt({ type: "separator" } as Menu);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders nothing for an unknown type", () => {
    const { container } = renderAt({ type: "custom" } as never);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a leaf menu linking to its path and fires onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderAt(leaf(), onClick);
    const link = screen.getByRole("link", { name: /Dashboard/ });
    expect(link).toHaveAttribute("href", "/dashboard");
    await user.click(link);
    expect(onClick).toHaveBeenCalled();
  });

  it("renders a badge on a leaf menu", () => {
    renderAt(leaf({ badge: "beta" }));
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("opens a sheet with child menus for a parent", async () => {
    const user = userEvent.setup();
    const parent = leaf({
      name: "Settings",
      path: "/settings",
      children: [
        { type: "menu", id: "c1", name: "General", path: "/settings/general" } as never,
        { type: "menu", id: "c2", name: "Security", path: "/settings/security" } as never,
      ],
    });
    renderAt(parent);
    await user.click(screen.getByText("Settings"));
    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });
});
