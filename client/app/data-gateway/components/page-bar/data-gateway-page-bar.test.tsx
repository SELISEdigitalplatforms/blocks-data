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

describe("DataGatewayPageBar", () => {
  it("gathers the title, endpoint, utilities, publish state and sections", () => {
    render(<DataGatewayPageBar />);

    expect(screen.getByRole("heading", { name: "Data Gateway" })).toBeInTheDocument();
    expect(screen.getByTestId("endpoint")).toBeInTheDocument();
    expect(screen.getByTestId("utilities")).toBeInTheDocument();
    expect(screen.getByTestId("publish")).toBeInTheDocument();
    expect(screen.getByTestId("sections")).toBeInTheDocument();
  });
});
