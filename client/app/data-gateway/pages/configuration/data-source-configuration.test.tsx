import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => toastMocks);
vi.mock("../../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => getMock(),
  useSaveDataSourceConfiguration: () => ({ isPending: false, mutateAsync: saveMock }),
}));

import { DataSourceConfiguration } from "./data-source-configuration";

const base = {
  projectKey: "t1",
  databaseName: "default",
  itemId: "item-1",
  isActive: true,
  isCollectionNameEditable: false,
  collectionNamePattern: "sb_{SchemaName}s",
  analyticsConfiguration: { enableAnalytics: false, enableDate: null, validTill: null },
};
const loaded = (data: object | null) =>
  getMock.mockReturnValue({ data: { isSuccess: true, data }, isLoading: false, isError: false });

const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Save Changes" }));
  await user.click(await screen.findByRole("button", { name: "Confirm" }));
};

describe("DataSourceConfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue({ isSuccess: true });
  });

  it("shows a loading state", () => {
    getMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<DataSourceConfiguration />);
    expect(screen.getByTestId("data-source-loading")).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    const refetch = vi.fn();
    getMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<DataSourceConfiguration />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("loads a default config: Blocks DB selected, no connection fields", async () => {
    loaded({ ...base, connectionType: "Default" });
    render(<DataSourceConfiguration />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Blocks database/ })).toBeChecked(),
    );
    expect(screen.queryByText("Connection String")).not.toBeInTheDocument();
  });

  it("loads a custom config: own DB selected, empty string field with the saved hint", async () => {
    loaded({ ...base, connectionType: "Custom", databaseName: "mydb" });
    render(<DataSourceConfiguration />);
    const input = await screen.findByPlaceholderText(/mongodb:\/\//);
    expect(input).toHaveValue("");
    expect(screen.getByText(/Saved — enter a new value to replace it/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("my-database")).toHaveValue("mydb");
  });

  it("shows the empty state and creates with POST when no config exists", async () => {
    loaded(null);
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    expect(screen.getByText(/No data source is configured yet/)).toBeInTheDocument();
    await confirm(user);
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0][0].exists).toBe(false);
    expect(saveMock.mock.calls[0][0].payload).toMatchObject({ connectionString: "default" });
  });

  it("switching default to own DB requires the connection string", async () => {
    loaded({ ...base, connectionType: "Default" });
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    await user.click(await screen.findByRole("radio", { name: /My data sources/ }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Connection string is required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/mongodb:\/\//), "mongodb://h/db");
    await user.type(screen.getByPlaceholderText("my-database"), "db");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      exists: true,
      payload: { connectionString: "mongodb://h/db", databaseName: "db", itemId: "item-1" },
    });
  });

  it("saving an existing own-DB config with an empty string omits connectionString (PUT, keep)", async () => {
    loaded({ ...base, connectionType: "Custom", databaseName: "mydb" });
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    await screen.findByPlaceholderText(/mongodb:\/\//);
    await confirm(user);
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const { payload, exists } = saveMock.mock.calls[0][0];
    expect(exists).toBe(true);
    expect(payload).not.toHaveProperty("connectionString");
    expect(payload).toMatchObject({ databaseName: "mydb", itemId: "item-1" });
  });

  it("switching custom to Blocks DB sends default with PUT", async () => {
    loaded({ ...base, connectionType: "Custom", databaseName: "mydb" });
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    await user.click(await screen.findByRole("radio", { name: /Blocks database/ }));
    await confirm(user);
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0][0].exists).toBe(true);
    expect(saveMock.mock.calls[0][0].payload).toMatchObject({ connectionString: "default" });
    expect(toastMocks.showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the save is rejected", async () => {
    loaded({ ...base, connectionType: "Default" });
    saveMock.mockResolvedValue({ isSuccess: false, errors: ["bad"] });
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    await screen.findByRole("radio", { name: /Blocks database/ });
    await confirm(user);
    await waitFor(() =>
      expect(toastMocks.showErrorToast).toHaveBeenCalledWith({ errors: ["bad"] }),
    );
  });

  it("shows an error toast when the request throws", async () => {
    loaded({ ...base, connectionType: "Default" });
    saveMock.mockRejectedValue({ errors: { a: "boom" } });
    const user = userEvent.setup();
    render(<DataSourceConfiguration />);
    await screen.findByRole("radio", { name: /Blocks database/ });
    await confirm(user);
    await waitFor(() =>
      expect(toastMocks.showErrorToast).toHaveBeenCalledWith({ errors: { a: "boom" } }),
    );
  });
});
