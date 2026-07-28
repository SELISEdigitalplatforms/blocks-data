import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: Record<string, unknown> = {};
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
}));

let lastGroups: Array<{ name: string }> = [];
vi.mock("./permission-group-section", () => ({
  PermissionGroupSection: ({ group, onTrigger }: { group: { name: string }; onTrigger: () => void }) => {
    if (!lastGroups.find((g) => g.name === group.name)) lastGroups.push(group);
    return (
      <button type="button" data-testid={`group-${group.name}`} onClick={onTrigger}>
        {group.name}
      </button>
    );
  },
}));

import { PermissionsSelectionPanel } from "./permissions-selection-panel";

beforeEach(() => {
  lastGroups = [];
});
afterEach(() => vi.clearAllMocks());

describe("PermissionsSelectionPanel", () => {
  it("groups permissions by resourceGroup and falls back to Ungrouped", () => {
    state.permissionMap = new Map([
      ["a", { itemId: "a", resource: "a", resourceGroup: "Users" }],
      ["b", { itemId: "b", resource: "b", resourceGroup: "Users" }],
      ["c", { itemId: "c", resource: "c" }],
    ]);
    render(<PermissionsSelectionPanel />);
    expect(screen.getByTestId("group-Users")).toBeInTheDocument();
    expect(screen.getByTestId("group-Ungrouped")).toBeInTheDocument();
    expect(lastGroups).toHaveLength(2);
  });

  it("renders no group sections when the permission map is empty", () => {
    state.permissionMap = new Map();
    render(<PermissionsSelectionPanel />);
    expect(screen.queryByTestId(/^group-/)).not.toBeInTheDocument();
  });

  it("toggles the accordion when a group section triggers", async () => {
    const user = userEvent.setup();
    state.permissionMap = new Map([["a", { itemId: "a", resource: "a", resourceGroup: "Roles" }]]);
    render(<PermissionsSelectionPanel />);
    await user.click(screen.getByTestId("group-Roles"));
    expect(screen.getByTestId("group-Roles")).toBeInTheDocument();
  });
});
