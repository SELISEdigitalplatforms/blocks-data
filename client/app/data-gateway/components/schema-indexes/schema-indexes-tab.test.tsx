import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const useSchemaIndexes = vi.fn();
const deleteIndex = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("../../hooks/use-configuration", () => ({
  useSchemaIndexes: (...a: unknown[]) => useSchemaIndexes(...a),
  useDeleteSchemaIndex: () => ({ mutateAsync: deleteIndex, isPending: false }),
  useCreateSchemaIndex: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { SchemaIndexesTab } from "./schema-indexes-tab";

const fields = [{ name: "email" }, { name: "lastName" }, { name: "age" }];

function renderTab(schemaType = 1) {
  return render(
    <TooltipProvider>
      <SchemaIndexesTab
        schemaDefinitionItemId="schema-1"
        schemaType={schemaType}
        fields={fields}
      />
    </TooltipProvider>,
  );
}

describe("SchemaIndexesTab", () => {
  beforeEach(() => {
    useSchemaIndexes.mockReset();
    deleteIndex.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("shows the empty state and an Add index button when there are no indexes", () => {
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } }, isLoading: false });
    renderTab();

    expect(screen.getByText("No indexes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add index/ })).toBeEnabled();
  });

  it("lists existing single-field and compound indexes with direction and a Unique badge", () => {
    useSchemaIndexes.mockReturnValue({
      data: {
        data: {
          indexes: [
            {
              itemId: "idx-1",
              name: "email_1",
              isUnique: true,
              createdDate: "2026-01-01T00:00:00Z",
              fields: [{ fieldName: "email", direction: "ASC" }],
            },
            {
              itemId: "idx-2",
              name: "lastName_1_age_-1",
              isUnique: false,
              createdDate: "2026-01-01T00:00:00Z",
              fields: [
                { fieldName: "lastName", direction: "ASC" },
                { fieldName: "age", direction: "DESC" },
              ],
            },
          ],
        },
      },
      isLoading: false,
    });
    renderTab();

    expect(screen.getByText("email (Ascending) · Unique")).toBeInTheDocument();
    expect(
      screen.getByText("lastName (Ascending), age (Descending)"),
    ).toBeInTheDocument();
  });

  it("disables Add index when the schema is Dto-type and shows an explanatory message", () => {
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } }, isLoading: false });
    renderTab(2);

    expect(screen.getByRole("button", { name: /Add index/ })).toBeDisabled();
    expect(
      screen.getAllByText("Indexes are only supported on Entity schemas.").length,
    ).toBeGreaterThan(0);
  });

  it("disables Add index once the schema already has 15 indexes", () => {
    const indexes = Array.from({ length: 15 }, (_, i) => ({
      itemId: `idx-${i}`,
      name: `f${i}_1`,
      isUnique: false,
      createdDate: "2026-01-01T00:00:00Z",
      fields: [{ fieldName: `f${i}`, direction: "ASC" as const }],
    }));
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes } }, isLoading: false });
    renderTab();

    expect(screen.getByRole("button", { name: /Add index/ })).toBeDisabled();
  });

  it("deletes an index after confirmation and shows a success toast", async () => {
    const user = userEvent.setup();
    deleteIndex.mockResolvedValue({ isSuccess: true });
    useSchemaIndexes.mockReturnValue({
      data: {
        data: {
          indexes: [
            {
              itemId: "idx-1",
              name: "email_1",
              isUnique: false,
              createdDate: "2026-01-01T00:00:00Z",
              fields: [{ fieldName: "email", direction: "ASC" }],
            },
          ],
        },
      },
      isLoading: false,
    });
    renderTab();

    await user.click(screen.getByRole("button", { name: /Delete index/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteIndex).toHaveBeenCalledWith({
        itemId: "idx-1",
        schemaDefinitionItemId: "schema-1",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error and keeps the index listed when delete fails", async () => {
    const user = userEvent.setup();
    deleteIndex.mockResolvedValue({ isSuccess: false, message: "INDEX_NOT_FOUND" });
    useSchemaIndexes.mockReturnValue({
      data: {
        data: {
          indexes: [
            {
              itemId: "idx-1",
              name: "email_1",
              isUnique: false,
              createdDate: "2026-01-01T00:00:00Z",
              fields: [{ fieldName: "email", direction: "ASC" }],
            },
          ],
        },
      },
      isLoading: false,
    });
    renderTab();

    await user.click(screen.getByRole("button", { name: /Delete index/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(screen.getByText("email (Ascending)")).toBeInTheDocument();
  });
});
