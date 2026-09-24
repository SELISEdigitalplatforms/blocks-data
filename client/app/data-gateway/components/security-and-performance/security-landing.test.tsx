import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const navigateMock = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));

vi.mock("../page-bar", () => ({
  DataGatewayPageBar: () => <div data-testid="page-bar" />,
}));

vi.mock("./security-and-performance", () => ({
  default: ({
    onSchemaRowClick,
    onSchemaCreated,
    onNavigateToSchemas,
  }: {
    onSchemaRowClick: (s: { id: string }) => void;
    onSchemaCreated: (id: string) => void;
    onNavigateToSchemas: () => void;
  }) => (
    <div>
      <button onClick={() => onSchemaRowClick({ id: "row1" })}>row-click</button>
      <button onClick={() => onSchemaCreated("created1")}>created</button>
      <button onClick={onNavigateToSchemas}>to-schemas</button>
    </div>
  ),
}));

import { SecurityLanding } from "./security-landing";

function renderLanding() {
  render(
    <MemoryRouter initialEntries={["/dg/security"]}>
      <SecurityLanding />
    </MemoryRouter>,
  );
}

describe("SecurityLanding", () => {
  beforeEach(() => navigateMock.mockReset());

  it("heads the route with the shared page bar", () => {
    renderLanding();
    expect(screen.getByTestId("page-bar")).toBeInTheDocument();
  });

  it("opens a clicked schema on the schemas route with its id", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "row-click" }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/dg?type=all&schemaId=row1&page=1&pageSize=15",
    );
  });

  it("opens a newly created schema the same way", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "created" }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/dg?type=all&schemaId=created1&page=1&pageSize=15",
    );
  });

  it("sends the empty-state action to the bare schemas route", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "to-schemas" }));
    expect(navigateMock).toHaveBeenCalledWith("/dg");
  });
});
