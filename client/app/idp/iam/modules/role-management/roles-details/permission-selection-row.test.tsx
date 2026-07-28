import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: Record<string, unknown> = {};
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
}));

vi.mock("./required-permission-dialog", () => ({
  RequiredPermissionsDialog: ({ open }: { open: boolean }) => (
    <div data-testid="required-dialog">{open ? "open" : "closed"}</div>
  ),
}));
vi.mock("./affected-dependents-dialog", () => ({
  AffectedPermissionsDialog: ({ open }: { open: boolean }) => (
    <div data-testid="affected-dialog">{open ? "open" : "closed"}</div>
  ),
}));
vi.mock("./permission-toggle-card", () => ({
  PermissionToggleCard: ({ onCheckedChange }: { onCheckedChange: (c: boolean) => void }) => (
    <button type="button" data-testid="toggle" onClick={() => onCheckedChange(true)}>
      toggle-on
    </button>
  ),
}));

import { PermissionSelectionRow } from "./permission-selection-row";

const changePermissionSelection = vi.fn();

const makeMap = (entries: Array<[string, Record<string, unknown>]>) => new Map(entries);

beforeEach(() => {
  state.permissionMap = makeMap([]);
  state.changePermissionSelection = changePermissionSelection;
});
afterEach(() => vi.clearAllMocks());

describe("PermissionSelectionRow", () => {
  it("selects the permission directly when there are no dependents or parents", async () => {
    const user = userEvent.setup();
    render(
      <PermissionSelectionRow
        permission={{ itemId: "1", resource: "read", dependentPermissions: [], parents: [] } as never}
      />,
    );
    await user.click(screen.getByTestId("toggle"));
    expect(changePermissionSelection).toHaveBeenCalledWith([
      { permissionResource: "read", isChecked: true },
    ]);
  });

  it("opens the required-permissions dialog when the permission has dependents", async () => {
    const user = userEvent.setup();
    render(
      <PermissionSelectionRow
        permission={{ itemId: "1", resource: "read", dependentPermissions: ["dep"], parents: [] } as never}
      />,
    );
    expect(screen.getByTestId("required-dialog")).toHaveTextContent("closed");
    await user.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("required-dialog")).toHaveTextContent("open");
    expect(changePermissionSelection).not.toHaveBeenCalled();
  });

  it("renders both dialogs closed initially", () => {
    render(
      <PermissionSelectionRow
        permission={{ itemId: "2", resource: "write", dependentPermissions: [], parents: [] } as never}
      />,
    );
    expect(screen.getByTestId("required-dialog")).toHaveTextContent("closed");
    expect(screen.getByTestId("affected-dialog")).toHaveTextContent("closed");
  });
});
