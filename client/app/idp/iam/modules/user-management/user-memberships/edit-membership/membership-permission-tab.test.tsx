import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui-kits/tabs/tabs";
import { MembershipPermissionsTab } from "./membership-permission-tab";

const baseProps = {
  isEditing: true,
  permissionsSearch: "",
  onPermissionsSearchChange: vi.fn(),
  permissionsTypeFilter: "all",
  onPermissionsTypeFilterChange: vi.fn(),
  permissionsPage: 0,
  onPermissionsPageChange: vi.fn(),
  isPermissionsLoading: false,
  allPermissions: [
    { itemId: "1", name: "read", type: 1, roles: ["admin"] },
    { itemId: "2", name: "write", type: 2 },
  ],
  selectedPermissions: ["read"],
  totalPermissions: 2,
  totalPermissionPages: 5,
  onPermissionToggle: vi.fn(),
};

const renderTab = (props = {}) =>
  render(
    <Tabs defaultValue="permissions">
      <MembershipPermissionsTab {...baseProps} {...props} />
    </Tabs>,
  );

afterEach(() => vi.clearAllMocks());

describe("MembershipPermissionsTab", () => {
  it("renders the editable table with permissions and pagination info", () => {
    renderTab();
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1-2 of 2 permissions/)).toBeInTheDocument();
  });

  it("shows loading skeletons while permissions load", () => {
    const { container } = renderTab({ isPermissionsLoading: true });
    expect(container.querySelectorAll("[class*='animate-pulse'], .space-y-2 > *").length).toBeGreaterThan(0);
  });

  it("fires the search change handler when typing", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByTestId("permission-tab-searchbar"), "r");
    expect(baseProps.onPermissionsSearchChange).toHaveBeenCalled();
  });

  it("toggles a permission when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(baseProps.onPermissionToggle).toHaveBeenCalled();
  });

  it("changes page with the pagination buttons", async () => {
    const user = userEvent.setup();
    renderTab({ permissionsPage: 1 });
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(baseProps.onPermissionsPageChange).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Previous/i }));
    expect(baseProps.onPermissionsPageChange).toHaveBeenCalled();
  });

  it("shows an empty-state row when there are no permissions", () => {
    renderTab({ allPermissions: [] });
    expect(screen.getByText("No permissions found")).toBeInTheDocument();
  });

  it("renders the read-only view when not editing", () => {
    renderTab({ isEditing: false });
    expect(screen.getByText(/Showing 1-1 of 1 permissions/)).toBeInTheDocument();
  });

  it("shows the no-permissions-assigned message in read-only view", () => {
    renderTab({ isEditing: false, selectedPermissions: [] });
    expect(screen.getByText("No permissions assigned")).toBeInTheDocument();
  });
});
