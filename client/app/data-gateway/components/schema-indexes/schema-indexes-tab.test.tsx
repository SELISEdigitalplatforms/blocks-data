import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows the frontend-only ItemId index without counting it as a custom index", async () => {
    const user = userEvent.setup();
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } }, isLoading: false });
    renderTab();

    expect(screen.getByText("0 of 15 custom indexes")).toBeInTheDocument();
    expect(screen.getByText("_id_")).toBeInTheDocument();
    expect(screen.getByText("Unique")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete index _id_" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add index/ })).toBeEnabled();

    await user.click(screen.getByText("_id_").closest("button")!);
    const properties = screen.getByRole("list", {
      name: "Properties and order for _id_",
    });
    expect(within(properties).getByRole("listitem")).toHaveTextContent("1ItemId↑");
  });

  it("shows full-row index summaries and expands ordered properties", async () => {
    const user = userEvent.setup();
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

    expect(screen.getByText("_id_")).toBeInTheDocument();
    expect(screen.getByText("email_1")).toBeInTheDocument();
    expect(screen.getByText("lastName_1_age_-1")).toBeInTheDocument();
    expect(screen.getAllByText("1 property")).toHaveLength(2);
    expect(screen.getByText("2 properties")).toBeInTheDocument();
    expect(screen.getAllByText("Unique")).toHaveLength(2);
    expect(screen.getByText("Non-unique")).toBeInTheDocument();

    await user.click(screen.getByText("email_1").closest("button")!);

    const emailProperties = screen.getByRole("list", {
      name: "Properties and order for email_1",
    });
    expect(within(emailProperties).getByRole("listitem")).toHaveTextContent("1email↑");

    await user.click(screen.getByText("lastName_1_age_-1").closest("button")!);

    const compoundProperties = screen.getByRole("list", {
      name: "Properties and order for lastName_1_age_-1",
    });
    const orderedProperties = within(compoundProperties).getAllByRole("listitem");
    expect(orderedProperties[0]).toHaveTextContent("1lastName↑");
    expect(orderedProperties[1]).toHaveTextContent("2age↓");
  });

  it("disables Add index when the schema is Dto-type and shows an explanatory message", () => {
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } }, isLoading: false });
    renderTab(2);

    expect(screen.queryByText("_id_")).not.toBeInTheDocument();
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

    expect(screen.getByText("15 of 15 custom indexes")).toBeInTheDocument();
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
    expect(screen.getByText("email_1")).toBeInTheDocument();
  });
});
