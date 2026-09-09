import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Radix Select relies on pointer-capture and scrollIntoView APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const createIndex = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("../../hooks/use-configuration", () => ({
  useCreateSchemaIndex: () => ({ mutateAsync: createIndex, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { SchemaIndexForm } from "./schema-index-form";

const baseProps = {
  schemaDefinitionItemId: "schema-1",
  availableFields: ["email", "lastName", "age"],
};

describe("SchemaIndexForm", () => {
  beforeEach(() => {
    createIndex.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("creates a single-field index and reports success", async () => {
    const user = userEvent.setup();
    createIndex.mockResolvedValue({ isSuccess: true, data: { acknowledged: true, itemId: "idx-1" } });
    const onSaved = vi.fn();
    render(<SchemaIndexForm {...baseProps} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: "email" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createIndex).toHaveBeenCalledWith({
        schemaDefinitionItemId: "schema-1",
        fields: [{ fieldName: "email", direction: "ASC" }],
        isUnique: false,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("adds a second field row for a compound index, up to the fields available", async () => {
    const user = userEvent.setup();
    render(<SchemaIndexForm {...baseProps} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByRole("combobox").length).toBe(2); // field + direction, one row
    await user.click(screen.getByRole("button", { name: /Add field/ }));
    expect(screen.getAllByRole("combobox").length).toBe(4); // two rows
  });

  it("keeps Save disabled and makes no API call when no field is selected", () => {
    render(<SchemaIndexForm {...baseProps} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(createIndex).not.toHaveBeenCalled();
  });

  it("shows the mapped server error inline and does not call onSaved", async () => {
    const user = userEvent.setup();
    createIndex.mockResolvedValue({ isSuccess: false, message: "UNIQUE_INDEX_CONFLICT" });
    const onSaved = vi.fn();
    render(<SchemaIndexForm {...baseProps} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: "email" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Cannot create a unique index: this field combination already has duplicate values in existing data.",
        ),
      ).toBeInTheDocument(),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("fires onCancel from the Cancel button", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SchemaIndexForm {...baseProps} onSaved={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
