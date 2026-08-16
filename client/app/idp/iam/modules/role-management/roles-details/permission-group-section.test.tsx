import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Accordion } from "@/components/ui-kits/accordion/accordion";

const state: Record<string, unknown> = {};
vi.mock("./role-details-state", () => ({
  useRoleDetailsStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state),
}));
vi.mock("./permission-selection-row", () => ({
  PermissionSelectionRow: ({ permission }: { permission: { resource: string } }) => (
    <li data-testid="row">{permission.resource}</li>
  ),
}));

import { PermissionGroupSection } from "./permission-group-section";

const changePermissionGroupSelection = vi.fn();
const onTrigger = vi.fn();

const perm = (resource: string, extra: Record<string, unknown> = {}) => ({
  itemId: resource,
  resource,
  dependentPermissions: [],
  ...extra,
});

const renderGroup = (group: Record<string, unknown>) =>
  render(
    <Accordion type="single" collapsible defaultValue={group.name as string}>
      <PermissionGroupSection group={group as never} onTrigger={onTrigger} />
    </Accordion>,
  );

const mapFor = (resources: string[]) =>
  new Map(
    resources.map((r) => [r, { modified: true, changeState: "added", isInitiallyAssigned: true }]),
  );

beforeEach(() => {
  state.changePermissionGroupSelection = changePermissionGroupSelection;
  state.isEditMode = true;
  state.permissionMap = new Map();
});
afterEach(() => vi.clearAllMocks());

describe("PermissionGroupSection", () => {
  it("renders group name, total count and rows", () => {
    renderGroup({ name: "Users", permissions: [perm("read"), perm("write")] });
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("2 total permissions")).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("shows selected count when some permissions are checked", () => {
    state.permissionMap = mapFor(["read"]);
    renderGroup({ name: "Users", permissions: [perm("read"), perm("write")] });
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("toggles the whole group when the group checkbox changes", async () => {
    const user = userEvent.setup();
    renderGroup({ name: "Users", permissions: [perm("read")] });
    await user.click(screen.getByRole("checkbox"));
    expect(changePermissionGroupSelection).toHaveBeenCalled();
  });

  it("fires onTrigger when the header is clicked", async () => {
    const user = userEvent.setup();
    renderGroup({ name: "Roles", permissions: [perm("read")] });
    await user.click(screen.getByText("Roles"));
    expect(onTrigger).toHaveBeenCalled();
  });

  it.each([["{Enter}"], [" "]])("fires onTrigger when %s is pressed on the header", async (key) => {
    const user = userEvent.setup();
    renderGroup({ name: "Roles", permissions: [perm("read")] });

    const header = screen.getByText("Roles").closest('[role="button"]') as HTMLElement;
    header.focus();
    await user.keyboard(key);

    expect(onTrigger).toHaveBeenCalled();
  });

  it("disables the group checkbox when not in edit mode", () => {
    state.isEditMode = false;
    renderGroup({ name: "Users", permissions: [perm("read")] });
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
