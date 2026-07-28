import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

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

  it("opens the confirmation modal and submits the edit on Update", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({
      mode: "edit",
      defaultValues: {
        schemaName: "User",
        schemaType: "Entity",
        entityName: "sb_Users",
      },
    });

    // Trigger validation so the Save button enables.
    await user.type(screen.getByPlaceholderText("Enter schema name"), "s");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    // The confirmation dialog appears.
    const updateBtn = await screen.findByRole("button", { name: "Update" });
    await user.click(updateBtn);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ schemaName: "Users", schemaType: "Entity" }),
      ),
    );
  });

  it("surfaces an error toast when the edit submission throws", async () => {
    const { showErrorToast } = await import("@/hooks/use-toast");
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <AddEditSchemaModal
          mode="edit"
          defaultValues={{
            schemaName: "User",
            schemaType: "Entity",
            entityName: "sb_Users",
          }}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </Dialog>,
    );

    await user.type(screen.getByPlaceholderText("Enter schema name"), "s");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await user.click(await screen.findByRole("button", { name: "Update" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("closes the confirmation modal from its Cancel button", async () => {
    const user = userEvent.setup();
    renderModal({
      mode: "edit",
      defaultValues: {
        schemaName: "User",
        schemaType: "Entity",
        entityName: "sb_Users",
      },
    });

    await user.type(screen.getByPlaceholderText("Enter schema name"), "s");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    const dialogCancel = await screen.findByRole("button", { name: "Cancel" });
    await user.click(dialogCancel);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument(),
    );
  });

  it("sanitizes pasted illegal characters in the schema name", async () => {
    const user = userEvent.setup();
    renderModal();
    const input = screen.getByPlaceholderText("Enter schema name");
    await user.click(input);
    await user.paste("ab!!cd");
    await waitFor(() => expect(input).toHaveValue("abcd"));
  });

  it("sanitizes typed illegal characters in the schema name", async () => {
    renderModal();
    const input = screen.getByPlaceholderText("Enter schema name");
    fireEvent.change(input, { target: { value: "ab$c" } });
    await waitFor(() => expect(input).toHaveValue("abc"));
    // Add mode derives the entity name from the sanitized value.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Enter entity name")).toHaveValue(
        "sb_abcs",
      ),
    );
  });

  it("hides the entity name when the schema type is set to Child", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(
      screen.getByPlaceholderText("Enter entity name"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Child" }));

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("Enter entity name"),
      ).not.toBeInTheDocument(),
    );
  });

  it("sanitizes typed and pasted illegal characters in the entity name", async () => {
    renderModal();
    const entity = screen.getByPlaceholderText("Enter entity name");

    fireEvent.change(entity, { target: { value: "en$ty" } });
    await waitFor(() => expect(entity).toHaveValue("enty"));

    entity.focus();
    (entity as HTMLInputElement).setSelectionRange(
      (entity as HTMLInputElement).value.length,
      (entity as HTMLInputElement).value.length,
    );
    fireEvent.paste(entity, { clipboardData: { getData: () => "!!z" } });
    await waitFor(() => expect(entity).toHaveValue("entyz"));
  });
});
