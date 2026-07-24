import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const changePermissionSelection = vi.fn();
const permissionMap = new Map<string, unknown>([
  ["d1", { itemId: "d1", resource: "d1", name: "Dep 1", isInitiallyAssigned: false }],
  ["d2", { itemId: "d2", resource: "d2", name: "Dep 2", isInitiallyAssigned: true }],
]);
const state = { permissionMap, changePermissionSelection };
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

vi.mock("./permission-toggle-card", () => ({
  PermissionToggleCard: ({
    id,
    onCheckedChange,
  }: {
    id: string;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button data-testid={id} onClick={() => onCheckedChange(true)}>
      {id}
    </button>
  ),
}));

import { RequiredPermissionsDialog } from "./required-permission-dialog";

const permission = {
  itemId: "p1",
  resource: "p1",
  dependentPermissions: ["d1", "d2"],
} as never;

afterEach(() => vi.clearAllMocks());

describe("RequiredPermissionsDialog", () => {
  it("renders the title, dependencies section and a card per dependent", () => {
    render(
      <RequiredPermissionsDialog permission={permission} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText("Review Permission Changes")).toBeInTheDocument();
    expect(screen.getByText("Dependencies")).toBeInTheDocument();
    expect(screen.getByTestId("modal-p1")).toBeInTheDocument();
    expect(screen.getByTestId("dependent-d1")).toBeInTheDocument();
    expect(screen.getByTestId("dependent-d2")).toBeInTheDocument();
  });

  it("collects toggled selections and commits them on Save", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <RequiredPermissionsDialog permission={permission} open onOpenChange={onOpenChange} />,
    );
    await user.click(screen.getByTestId("dependent-d1"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(changePermissionSelection).toHaveBeenCalledWith([
      { isChecked: true, permissionResource: "d1" },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
