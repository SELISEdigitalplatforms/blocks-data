import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

const useSchemaListMock = vi.fn(() => ({
  data: { data: { items: [] as Array<{ schemaName: string }> } },
}));

vi.mock("../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => ({
    data: {
      data: {
        isCollectionNameEditable: true,
        collectionNamePattern: "sb_{SchemaName}s",
      },
    },
  }),
  useSchemaList: (...a: unknown[]) => useSchemaListMock(...(a as [])),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ showErrorToast: vi.fn() }));

import { AddEditSchemaModal } from "./add-edit-schema";

function renderModal(props: Partial<Parameters<typeof AddEditSchemaModal>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true);
  const onCancel = vi.fn();
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <AddEditSchemaModal
        mode="add"
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </Dialog>,
  );
  return { onSubmit, onCancel };
}

describe("AddEditSchemaModal", () => {
  beforeEach(() => {
    useSchemaListMock.mockReturnValue({ data: { data: { items: [] } } });
  });

  it("renders the add form with a disabled submit until valid", () => {
    renderModal();
    expect(screen.getByText("Add New Schema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("auto-fills the entity name from the schema name and submits", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.type(screen.getByPlaceholderText("Enter schema name"), "User");
    // Entity name is derived from the collection-name pattern
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Enter entity name")).toHaveValue(
        "sb_Users",
      ),
    );

    const addBtn = screen.getByRole("button", { name: "Add" });
    await waitFor(() => expect(addBtn).toBeEnabled());
    await user.click(addBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "User",
        schemaType: "Entity",
        entityName: "sb_Users",
      }),
    );
  });

  it("shows a duplicate-name error when the name already exists", async () => {
    const user = userEvent.setup();
    useSchemaListMock.mockReturnValue({
      data: { data: { items: [{ schemaName: "User" }] } },
    });
    renderModal();

    await user.type(screen.getByPlaceholderText("Enter schema name"), "User");
    expect(
      await screen.findByText("Schema with this name already exists"),
    ).toBeInTheDocument();
  });

  it("renders the edit variant with the impact warning", () => {
    renderModal({
      mode: "edit",
      defaultValues: {
        schemaName: "User",
        schemaType: "Entity",
        entityName: "sb_Users",
      },
    });
    expect(screen.getByText("Edit Schema")).toBeInTheDocument();
    expect(
      screen.getByText(/Editing schema properties will impact all areas/i),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
