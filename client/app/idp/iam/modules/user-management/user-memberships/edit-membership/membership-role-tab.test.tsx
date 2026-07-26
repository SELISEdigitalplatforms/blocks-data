import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui-kits/tabs/tabs";
import { MembershipRolesTab } from "./membership-role-tab";

const baseProps = {
  isEditing: true,
  rolesSearch: "",
  onRolesSearchChange: vi.fn(),
  isRolesLoading: false,
  filteredRoles: [
    { slug: "admin", name: "Administrator" },
    { slug: "viewer", name: "Viewer" },
  ],
  selectedRoles: ["admin"],
  onRoleToggle: vi.fn(),
  getRoleDisplayName: (slug: string) => `Role: ${slug}`,
};

const renderTab = (props = {}) =>
  render(
    <Tabs defaultValue="roles">
      <MembershipRolesTab {...baseProps} {...props} />
    </Tabs>,
  );

afterEach(() => vi.clearAllMocks());

describe("MembershipRolesTab", () => {
  it("renders the editable role list with checkboxes", () => {
    renderTab();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("fires the search handler when typing", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByTestId("role-tab-searchbar"), "a");
    expect(baseProps.onRolesSearchChange).toHaveBeenCalled();
  });

  it("toggles a role when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getAllByRole("checkbox")[1]);
    expect(baseProps.onRoleToggle).toHaveBeenCalledWith("viewer");
  });

  it("shows loading skeletons while roles load", () => {
    const { container } = renderTab({ isRolesLoading: true });
    expect(container.querySelectorAll(".space-y-2 > *").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no roles", () => {
    renderTab({ filteredRoles: [] });
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });

  it("renders the read-only assigned roles view", () => {
    renderTab({ isEditing: false });
    expect(screen.getByText("Role: admin")).toBeInTheDocument();
  });

  it("shows the no-roles-assigned message in read-only view", () => {
    renderTab({ isEditing: false, selectedRoles: [] });
    expect(screen.getByText("No roles assigned")).toBeInTheDocument();
  });
});
