import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const getPermissions = vi.fn();
let groupedReturn: { data?: { data: unknown[] }; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@blocks-idp/iam/services/permission.service", () => ({
  permissionService: { getPermissions: (...a: unknown[]) => getPermissions(...a) },
}));
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => groupedReturn,
}));

import { PermissionSelection } from "./permission-selection";

const perm = (over: Record<string, unknown> = {}) => ({
  itemId: "id",
  name: "Name",
  type: 1,
  description: "",
  resource: "res",
  resourceGroup: "GroupA",
  projectKey: "tenant-1",
  tags: [],
  roles: [],
  dependentPermissions: [] as string[],
  isArchived: false,
  isBuiltIn: false,
  language: null,
  organizationIds: [],
  permissionSeverity: 2,
  ...over,
});

// A FE action (type 2) with one dependent, plus an independent permission.
const grouped = [
  perm({
    itemId: "fa1",
    type: 2,
    name: "FE Action 1",
    resource: "r-fa",
    dependentPermissions: ["r-dep"],
  }),
  perm({ itemId: "dep1", type: 1, name: "Dependent 1", resource: "r-dep" }),
  perm({ itemId: "ind1", type: 1, name: "Independent 1", resource: "r-ind" }),
];

const resourceGroups = [{ resourceGroup: "GroupA", count: 3 }];

beforeEach(() => {
  vi.clearAllMocks();
  groupedReturn = { data: { data: grouped }, isLoading: false };
  // Role permissions initially selected: only the independent permission.
  getPermissions.mockResolvedValue({
    data: [perm({ itemId: "ind1", type: 1, name: "Independent 1", resource: "r-ind" })],
  });
});

const renderComp = (ref?: React.Ref<unknown>) =>
  render(<PermissionSelection ref={ref} slug="role-slug" resourceGroups={resourceGroups} />, {
    wrapper: createWrapper(),
  });

describe("PermissionSelection", () => {
  it("shows loading skeletons while role permissions are pending", () => {
    getPermissions.mockReturnValue(new Promise(() => {})); // never resolves -> loading
    const { container } = renderComp();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders each resource group with its total and selected counts", async () => {
    renderComp();
    await waitFor(() => expect(getPermissions).toHaveBeenCalled());
    expect(await screen.findByText("GroupA")).toBeInTheDocument();
    expect(screen.getByText(/Total Permissions: 3/)).toBeInTheDocument();
  });

  it("loads group permissions when the accordion opens and toggles a FE action with its dependent", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText("GroupA");

    await user.click(screen.getByRole("button", { name: /GroupA/ }));

    // Group permissions rendered from the cache populated on open. Labels are
    // separate elements, so look the checkboxes up by their stable ids.
    const faBox = (await screen.findByText("FE Action 1")) && document.getElementById("perm-fa1")!;
    expect(faBox).toBeInTheDocument();
    expect(document.getElementById("perm-dep1")).toBeInTheDocument();
    expect(document.getElementById("perm-ind1")).toBeInTheDocument();

    // Toggling the FE action selects both it and its dependent.
    await user.click(faBox);
    await waitFor(() =>
      expect(document.getElementById("perm-fa1")).toHaveAttribute("data-state", "checked"),
    );
    expect(document.getElementById("perm-dep1")).toHaveAttribute("data-state", "checked");
  });

  it("exposes handleSave via ref returning added and removed permissions", async () => {
    const ref = createRef<{ handleSave: () => { addedPermissions: unknown[]; removedPermissions: unknown[] } }>();
    const user = userEvent.setup();
    renderComp(ref);
    await screen.findByText("GroupA");
    await user.click(screen.getByRole("button", { name: /GroupA/ }));
    await screen.findByText("FE Action 1");

    // Select the FE action + dependent (both newly added vs the initial ind1).
    await user.click(document.getElementById("perm-fa1") as HTMLElement);
    // Deselect the initially-selected independent permission.
    await user.click(document.getElementById("perm-ind1") as HTMLElement);

    const result = ref.current!.handleSave();
    const addedIds = result.addedPermissions.map((p) => (p as { itemId: string }).itemId);
    const removedIds = result.removedPermissions.map((p) => (p as { itemId: string }).itemId);
    expect(addedIds).toEqual(expect.arrayContaining(["fa1", "dep1"]));
    expect(removedIds).toContain("ind1");
  });

  it("reflects and clears full-group selection via the group checkbox", async () => {
    const user = userEvent.setup();
    renderComp();
    await screen.findByText("GroupA");
    await user.click(screen.getByRole("button", { name: /GroupA/ }));
    await screen.findByText("FE Action 1");

    const groupBox = () => document.getElementById("group-GroupA") as HTMLElement;
    // Group starts partially selected (only ind1) -> not fully checked.
    expect(groupBox()).toHaveAttribute("data-state", "unchecked");

    // Select every permission in the group individually.
    await user.click(document.getElementById("perm-fa1") as HTMLElement);
    await waitFor(() =>
      expect(groupBox()).toHaveAttribute("data-state", "checked"),
    );

    // The group checkbox lives inside the accordion trigger; clicking it runs
    // handleGroupToggle which deselects the whole group.
    await user.click(groupBox());
    await waitFor(() =>
      expect(groupBox()).toHaveAttribute("data-state", "unchecked"),
    );
  });

  it("shows the per-group loading text while grouped permissions load", async () => {
    const user = userEvent.setup();
    groupedReturn = { data: undefined, isLoading: true };
    renderComp();
    await screen.findByText("GroupA");
    await user.click(screen.getByRole("button", { name: /GroupA/ }));
    expect(await screen.findByText("Loading group permissions...")).toBeInTheDocument();
  });
});
