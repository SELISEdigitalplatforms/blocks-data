import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

/** The schema description in the create dialog (validation and access rules plan, section 7). */

// Stable results: the dialog checks the name against the list whenever the list result changes.
const config = { data: { data: { isCollectionNameEditable: true, collectionNamePattern: "sb_{SchemaName}s" } } };
const list = { data: { data: { items: [] } } };
vi.mock("../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => config,
  useSchemaList: () => list,
}));
vi.mock("@seliseblocks/genesis-os", () => ({ useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: vi.fn() }));

import { AddEditSchemaModal } from "./add-edit-schema";

function renderModal() {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <AddEditSchemaModal mode="add" onSubmit={onSubmit} onCancel={vi.fn()} />
    </Dialog>,
  );
  return onSubmit;
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

describe("AddEditSchemaModal: description", () => {
  it("sends the description with the new schema", async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal();
    await user.type(screen.getByPlaceholderText("Enter schema name"), "Customer");
    await user.type(screen.getByLabelText(/Description/), "Companies and people we sell to");
    const add = screen.getByRole("button", { name: "Add" });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schemaName: "Customer", description: "Companies and people we sell to" })));
  });

  it("refuses more than 500 characters", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByPlaceholderText("Enter schema name"), "Customer");
    await user.click(screen.getByLabelText(/Description/));
    await user.paste("x".repeat(501));

    expect(await screen.findByText("At most 500 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
