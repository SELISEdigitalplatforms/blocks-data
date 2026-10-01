import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const navigateMock = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://api" }));
vi.mock("../export-schema/export-schema-modal", () => ({
  default: () => <div data-testid="export-modal" />,
}));
vi.mock("../import-schema-modal", () => ({
  default: () => <div data-testid="import-modal" />,
}));

import { DataGatewayUtilities } from "./data-gateway-utilities";

function renderUtilities(path = "/dg") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataGatewayUtilities />
    </MemoryRouter>,
  );
}

/** The wide-screen row and the narrow-screen menu both render; pick the buttons. */
const utilityButton = (name: RegExp) =>
  screen.getAllByRole("button", { name }).at(-1)!;

describe("DataGatewayUtilities", () => {
  beforeEach(() => navigateMock.mockReset());

  it("offers the four gateway utilities as icon buttons", () => {
    renderUtilities();

    ["API Docs", "Import", "Export", "Configure"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  // Playground and Analytics used to sit in this menu. They are section tabs
  // now, so a destination has exactly one home.
  it("carries no navigation to sections", () => {
    renderUtilities();

    expect(screen.queryByRole("button", { name: /Playground/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Analytics/ })).not.toBeInTheDocument();
  });

  it("opens the swagger UI in a new tab from API Docs", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderUtilities();

    await user.click(utilityButton(/API Docs/));

    expect(openSpy).toHaveBeenCalledWith("http://api/swagger/index.html", "_blank");
    openSpy.mockRestore();
  });

  it("navigates to the configuration route from Configure", async () => {
    const user = userEvent.setup();
    renderUtilities();

    await user.click(utilityButton(/Configure/));
    expect(navigateMock).toHaveBeenCalledWith("/dg/configuration");
  });

  it("marks Configure active while on the configuration route", () => {
    renderUtilities("/dg/configuration");

    expect(utilityButton(/Configure/).className).toContain("text-primary");
  });

  it("opens the import modal on demand", async () => {
    const user = userEvent.setup();
    renderUtilities();

    expect(screen.queryByTestId("import-modal")).not.toBeInTheDocument();
    await user.click(utilityButton(/Import/));
    expect(await screen.findByTestId("import-modal")).toBeInTheDocument();
  });
});
