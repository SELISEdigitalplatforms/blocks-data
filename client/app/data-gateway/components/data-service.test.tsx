import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configResult: { data: unknown; isLoading: boolean };
vi.mock("../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => configResult,
}));
vi.mock("./data-service-instructions", () => ({
  DataServiceInstructions: () => <div data-testid="instructions" />,
}));
vi.mock("./schema-details-page", () => ({
  SchemaDetailsPage: () => <div data-testid="schema-details" />,
}));

import { DataService } from "./data-service";

afterEach(() => vi.clearAllMocks());

describe("DataService", () => {
  it("renders nothing while loading", () => {
    configResult = { data: undefined, isLoading: true };
    const { container } = render(<DataService />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the instructions when no data-service configuration exists", () => {
    configResult = { data: { data: null }, isLoading: false };
    render(<DataService />);
    expect(screen.getByTestId("instructions")).toBeInTheDocument();
  });

  it("shows the schema details page when configuration exists", () => {
    configResult = { data: { data: { itemId: "cfg" } }, isLoading: false };
    render(<DataService />);
    expect(screen.getByTestId("schema-details")).toBeInTheDocument();
  });
});
