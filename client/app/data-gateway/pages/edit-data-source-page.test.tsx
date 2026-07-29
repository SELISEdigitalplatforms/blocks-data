import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
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

  it("errors and closes the dialog when the configuration has no id", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: {
        data: {
          dbConnectionString: "default",
          databaseName: "default",
          isCollectionNameEditable: false,
          collectionNamePattern: "sb_{SchemaName}s",
        },
      },
      isLoading: false,
    });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["Configuration not found. Please reload the page."],
      }),
    );
    expect(updateDataSource).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Confirm data source update?"),
    ).not.toBeInTheDocument();
  });

  it("maps array error responses into readable messages", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    updateDataSource.mockResolvedValue({
      isSuccess: false,
      errors: [{ errorMessage: "e1" }, { propertyName: "p2" }, { code: 3 }],
    });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["e1", "p2", JSON.stringify({ code: 3 })],
      }),
    );
  });

  it("maps thrown errors that carry an errors array", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    updateDataSource.mockRejectedValue({ errors: [{ errorMessage: "boom" }] });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: ["boom"] }),
    );
  });

  it("shows a generic message when an unexpected error is thrown", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    updateDataSource.mockRejectedValue(new Error("kaboom"));
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["An unexpected error occurred. Please try again."],
      }),
    );
  });

  it("reveals custom-source fields and edits the collection pattern", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    updateDataSource.mockResolvedValue({ isSuccess: true });
    render(<EditDataSourcePage />);

    await user.click(screen.getByText("My data sources"));

    const connection = await screen.findByPlaceholderText(
      "mongodb://user:pass@host:27017/db",
    );
    await user.type(connection, "mongodb://localhost/db");
    await user.type(screen.getByPlaceholderText("my-database"), "mydb");

    // The split pattern editor keeps the {SchemaName} token fixed.
    await user.clear(screen.getByPlaceholderText("prefix"));
    await user.type(screen.getByPlaceholderText("prefix"), "col_");
    await user.clear(screen.getByPlaceholderText("postfix"));
    await user.type(screen.getByPlaceholderText("postfix"), "_v2");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(updateDataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: "mongodb://localhost/db",
          databaseName: "mydb",
          collectionNamePattern: "col_{SchemaName}_v2",
        }),
      ),
    );
  });

  it("dismisses the confirmation dialog from its Cancel button", async () => {
    const user = userEvent.setup();
    useGetDataServiceConfiguration.mockReturnValue({
      data: loadedConfig,
      isLoading: false,
    });
    render(<EditDataSourcePage />);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Confirm data source update?"),
      ).not.toBeInTheDocument(),
    );
    expect(updateDataSource).not.toHaveBeenCalled();
  });
});
