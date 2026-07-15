import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

const createDataSource = vi.fn();
const updateDataSource = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("../hooks/use-configuration", () => ({
  useCreateDataSourceConfiguration: () => ({ mutateAsync: createDataSource }),
  useUpdateDataSourceConfiguration: () => ({
    isPending: false,
    mutateAsync: updateDataSource,
  }),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import ConfigureDataSourceModal from "./configure-data-source";

function renderModal(props: Partial<Parameters<typeof ConfigureDataSourceModal>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <ConfigureDataSourceModal onCancel={onCancel} onConfirm={onConfirm} {...props} />
    </Dialog>,
  );
  return { onCancel, onConfirm };
}

describe("ConfigureDataSourceModal", () => {
  beforeEach(() => {
    createDataSource.mockReset();
    updateDataSource.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("renders the create title with both data-source options", () => {
    renderModal();
    expect(screen.getByText("Configure data source")).toBeInTheDocument();
    expect(screen.getByLabelText("Blocks database")).toBeInTheDocument();
    expect(screen.getByLabelText("My data sources")).toBeInTheDocument();
  });

  it("saves the default Blocks source without extra inputs", async () => {
    const user = userEvent.setup();
    createDataSource.mockResolvedValue({ isSuccess: true });
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(createDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "default",
        databaseName: "default",
        projectKey: "t1",
      }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it("requires connection details for a custom source before enabling Save", async () => {
    const user = userEvent.setup();
    createDataSource.mockResolvedValue({ isSuccess: true });
    renderModal();

    await user.click(screen.getByLabelText("My data sources"));
    const inputs = screen.getAllByPlaceholderText("Write here");
    expect(inputs).toHaveLength(2);

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(inputs[0], "mongodb://localhost");
    await user.type(inputs[1], "mydb");
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);
    expect(createDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "mongodb://localhost",
        databaseName: "mydb",
      }),
    );
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders the edit variant with an Update action", () => {
    renderModal({ mode: "edit", initialData: { ItemId: "cfg1" } as never });
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });
});
