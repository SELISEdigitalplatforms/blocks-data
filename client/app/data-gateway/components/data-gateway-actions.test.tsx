import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";

const navigateMock = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: "/data-gateway/configuration" }),
  };
});

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-scoped-path", () => ({
  useDataGatewayPath: () => "/data-gateway",
}));

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://api" }));

// Stub the heavy import/export modals — we only care about the action buttons here.
vi.mock("./export-schema/export-schema-modal", () => ({
  default: () => <div data-testid="export-modal" />,
}));
vi.mock("./import-schema-modal", () => ({
  default: () => <div data-testid="import-modal" />,
}));

import { DataGatewayActions } from "./data-gateway-actions";

function renderActions() {
  return render(
    <MemoryRouter>
      <DataGatewayActions />
    </MemoryRouter>,
  );
}

describe("DataGatewayActions", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("keeps API Docs and Playground inline, the rest behind the overflow menu (desktop)", () => {
    renderActions();

    expect(screen.getAllByText("API Docs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Playground").length).toBeGreaterThan(0);
    // Menu contents only mount once the menu is opened.
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Configure")).not.toBeInTheDocument();
  });

  it("shows the overflow actions once the desktop menu is opened", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByText("Import")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Configure")).toBeInTheDocument();
  });

  it("collapses every action, inline ones included, into the mobile menu", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    const menuItems = await screen.findAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
      "API Docs",
      "Playground",
      "Import",
      "Export",
      "Analytics",
      "Configure",
    ]);
  });

  it("opens the swagger UI in a new tab from API Docs", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderActions();

    await user.click(screen.getAllByRole("button", { name: /API Docs/ }).at(-1)!);

    expect(openSpy).toHaveBeenCalledWith(
      "http://api/swagger/index.html",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("navigates to the playground route when Playground is clicked", async () => {
    const user = userEvent.setup();
    renderActions();

    // The desktop inline buttons are actual <button>s
    const playground = screen
      .getAllByRole("button", { name: /Playground/ })
      .at(-1)!;
    await user.click(playground);
    expect(navigateMock).toHaveBeenCalledWith("/data-gateway/playground");
  });

  it("opens the export modal from the overflow menu", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Export"));

    expect(await screen.findByTestId("export-modal")).toBeInTheDocument();
  });
});
