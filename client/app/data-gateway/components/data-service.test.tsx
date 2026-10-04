import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configResult: {
  data: unknown;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  refetch?: () => void;
};
let selectedProject: { tenantId?: string } | null = { tenantId: "t1" };

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject }),
}));
vi.mock("../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => configResult,
}));
vi.mock("./data-service-instructions", () => ({
  DataServiceInstructions: () => <div data-testid="instructions" />,
}));
vi.mock("./schema-details-page", () => ({
  SchemaDetailsPage: () => <div data-testid="schema-details" />,
}));
vi.mock("./security-and-performance/loading-skeleton", () => ({
  default: () => <div data-testid="loading-skeleton" />,
}));

import { DataService } from "./data-service";

afterEach(() => {
  vi.clearAllMocks();
  selectedProject = { tenantId: "t1" };
});

describe("DataService", () => {
  it("shows loading chrome while configuration is fetching", () => {
    configResult = {
      data: undefined,
      isLoading: true,
      isFetching: true,
      refetch: vi.fn(),
    };
    render(<DataService />);
    expect(screen.getByTestId("data-service-loading")).toBeInTheDocument();
    expect(screen.getByText("Data Gateway")).toBeInTheDocument();
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("shows loading chrome when project context is not ready yet", () => {
    selectedProject = null;
    configResult = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<DataService />);
    expect(screen.getByTestId("data-service-loading")).toBeInTheDocument();
  });

  it("shows recovery UI when configuration fails", () => {
    configResult = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<DataService />);
    expect(screen.getByTestId("data-service-error")).toBeInTheDocument();
    expect(screen.getByText("Data Gateway")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByTestId("instructions")).toBeInTheDocument();
  });

  it("shows the instructions when no data-service configuration exists", () => {
    configResult = {
      data: { data: null },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<DataService />);
    expect(screen.getByTestId("instructions")).toBeInTheDocument();
  });

  it("shows the schema details page when configuration exists", () => {
    configResult = {
      data: { data: { itemId: "cfg" } },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<DataService />);
    expect(screen.getByTestId("schema-details")).toBeInTheDocument();
  });
});
