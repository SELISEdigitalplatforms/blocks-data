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

  it("renders the primary action buttons (desktop)", () => {
    renderActions();
    // Buttons appear in both mobile menu-item and desktop variants; use getAllByText
    expect(screen.getAllByText("Import").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Export").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Playground").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Configure").length).toBeGreaterThan(0);
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

  it("opens the export modal when Export is clicked", async () => {
    const user = userEvent.setup();
    renderActions();

    const exportBtn = screen.getAllByRole("button", { name: /Export/ }).at(-1)!;
    await user.click(exportBtn);
    expect(await screen.findByTestId("export-modal")).toBeInTheDocument();
  });
});
