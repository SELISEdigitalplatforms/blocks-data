import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetDataServiceConfiguration = vi.fn();
const updateDataSource = vi.fn();
const navigateMock = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: () => <nav data-testid="breadcrumb" />,
}));
vi.mock("../components/data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));

vi.mock("../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => useGetDataServiceConfiguration(),
  useUpdateDataSourceConfiguration: () => ({
    isPending: false,
    mutateAsync: updateDataSource,
  }),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

import EditDataSourcePage from "./edit-data-source-page";

const loadedConfig = {
  data: {
    dbConnectionString: "default",
    databaseName: "default",
    ItemId: "cfg1",
    isCollectionNameEditable: false,
    collectionNamePattern: "sb_{SchemaName}s",
  },
};

describe("EditDataSourcePage", () => {
  beforeEach(() => {
    useGetDataServiceConfiguration.mockReset();
    updateDataSource.mockReset();
    navigateMock.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
  });

  it("renders a loading spinner and no form while the config loads", () => {
    useGetDataServiceConfiguration.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<EditDataSourcePage />);
    expect(screen.queryByText("Data Source")).not.toBeInTheDocument();
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders both data-source sections once loaded", () => {
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    render(<EditDataSourcePage />);
    expect(screen.getByText("Data Source")).toBeInTheDocument();
    expect(screen.getByText("Collection Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("confirms and updates the data source with the default connection", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    updateDataSource.mockResolvedValue({ isSuccess: true });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(
      await screen.findByText("Confirm data source update?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(updateDataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: "default",
          itemId: "cfg1",
          projectKey: "t1",
        }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("navigates away when Cancel is clicked", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(navigateMock).toHaveBeenCalledWith("/dg");
  });
});
