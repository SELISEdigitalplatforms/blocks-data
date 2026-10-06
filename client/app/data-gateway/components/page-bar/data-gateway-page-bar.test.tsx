import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./data-gateway-sections", () => ({
  DataGatewaySections: () => <div data-testid="sections" />,
}));
vi.mock("./data-gateway-utilities", () => ({
  DataGatewayUtilities: () => <div data-testid="utilities" />,
}));
vi.mock("./endpoint-chip", () => ({ EndpointChip: () => <div data-testid="endpoint" /> }));
vi.mock("./publish-control", () => ({ PublishControl: () => <div data-testid="publish" /> }));

import { DataGatewayPageBar } from "./data-gateway-page-bar";
import { SHELL } from "../../utils/motion";

describe("DataGatewayPageBar", () => {
  it("gathers the title, endpoint, utilities, publish state and sections", () => {
    render(<DataGatewayPageBar />);

    expect(screen.getByRole("heading", { name: "Data Gateway" })).toBeInTheDocument();
    expect(screen.getByTestId("endpoint")).toBeInTheDocument();
    expect(screen.getByTestId("utilities")).toBeInTheDocument();
    expect(screen.getByTestId("publish")).toBeInTheDocument();
    expect(screen.getByTestId("sections")).toBeInTheDocument();
  });

  // The Schemas tab's own explorer sidebar is 264px wide, with a 16px gap to
  // its content column — 280px total. This row's own gap between the title
  // block and the tabs is 12px, so the title block itself needs to be 268px
  // (280 - 12) for the tabs to start exactly where that content column does,
  // rather than crowding right up against the endpoint chip.
  it("reserves exactly the Schemas explorer's width for the title block, so the tabs line up with its content column", () => {
    render(<DataGatewayPageBar />);

    const titleBlock = screen.getByRole("heading", { name: "Data Gateway" }).parentElement!;
    expect(titleBlock.style.getPropertyValue("--dg-title-w")).toBe(
      `${SHELL.explorerWidth - 12}px`,
    );
  });
});
