import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SchemaAccessToolbar } from "./schema-access-toolbar";

function handlers() {
  return {
    onEdit: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onAdd: vi.fn(),
  };
}

describe("SchemaAccessToolbar", () => {
  it("renders the Edit action in view mode and fires onEdit", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<SchemaAccessToolbar isEditing={false} {...h} />);

    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    expect(h.onEdit).toHaveBeenCalled();
  });

  it("renders Add/Cancel/Save in edit mode", () => {
    render(<SchemaAccessToolbar isEditing {...handlers()} />);
    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("disables Save until there are unsaved changes", () => {
    const { rerender } = render(
      <SchemaAccessToolbar isEditing hasUnsavedChanges={false} {...handlers()} />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    rerender(
      <SchemaAccessToolbar isEditing hasUnsavedChanges {...handlers()} />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows the saving state and disables actions while saving", () => {
    render(<SchemaAccessToolbar isEditing isSaving hasUnsavedChanges {...handlers()} />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeDisabled();
  });

  it("fires edit-mode callbacks", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<SchemaAccessToolbar isEditing hasUnsavedChanges {...h} />);

    await user.click(screen.getByRole("button", { name: /Add/ }));
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onAdd).toHaveBeenCalled();
    expect(h.onCancel).toHaveBeenCalled();
    expect(h.onSave).toHaveBeenCalled();
  });
});
