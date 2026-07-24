import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const changePermissionSelection = vi.fn();
const permissionMap = new Map<string, unknown>([
  ["par1", { itemId: "par1", name: "Parent One", description: "Parent desc" }],
  ["par2", { itemId: "par2", name: "Parent Two", description: "" }],
]);
const state = { permissionMap, changePermissionSelection };
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

import { AffectedPermissionsDialog } from "./affected-dependents-dialog";

const permission = {
  resource: "p1",
  permissionSeverity: 1,
  parents: ["par1", "par2"],
  type: 0,
} as never;

afterEach(() => vi.clearAllMocks());

describe("AffectedPermissionsDialog", () => {
  it("renders the review title, description and parent permissions", () => {
    render(
      <AffectedPermissionsDialog permission={permission} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText("Review Permission Changes")).toBeInTheDocument();
    expect(screen.getByText(/permissions depend on this permission/)).toBeInTheDocument();
    expect(screen.getByText("Parent One")).toBeInTheDocument();
    expect(screen.getByText("Parent Two")).toBeInTheDocument();
    // Falls back to a default description when none is provided.
    expect(screen.getByText("No description available.")).toBeInTheDocument();
  });

  it("removes the permission and closes the dialog on Save", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AffectedPermissionsDialog permission={permission} open onOpenChange={onOpenChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(changePermissionSelection).toHaveBeenCalledWith([
      { permissionResource: "p1", isChecked: false },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
