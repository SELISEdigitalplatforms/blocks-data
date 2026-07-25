import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const updateUser = vi.fn();
let userData: unknown;
let rolesData: unknown;
let permissionsData: unknown;
let isErr = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({
  isErrorWithErrors: () => isErr,
}));
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => ({ data: permissionsData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
  useUpdateUser: () => ({ mutateAsync: updateUser, isPending: false }),
}));

// Child components are mocked to expose the callbacks the parent wires up.
vi.mock("./membership-role-tab", () => ({
  MembershipRolesTab: (props: { getRoleDisplayName: (slug: string) => string; onRoleToggle: (id: string) => void; onRolesSearchChange: (q: string) => void; selectedRoles: string[]; filteredRoles: unknown[] }) => (
    <div data-testid="roles-tab">
      <span>role-name:{props.getRoleDisplayName("slug-a")}</span>
      <button onClick={() => props.onRoleToggle("role-1")}>toggle-role</button>
      <button onClick={() => props.onRolesSearchChange("admin")}>search-role</button>
      <span>selected-roles:{props.selectedRoles.join(",")}</span>
      <span>filtered:{props.filteredRoles.length}</span>
    </div>
  ),
}));
vi.mock("./membership-permission-tab", () => ({
  MembershipPermissionsTab: (props: { onPermissionToggle: (id: string) => void; onPermissionsSearchChange: (q: string) => void; onPermissionsTypeFilterChange: (t: string) => void; onPermissionsPageChange: (p: number) => void; selectedPermissions: string[]; totalPermissionPages: number }) => (
    <div data-testid="perms-tab">
      <button onClick={() => props.onPermissionToggle("perm-1")}>toggle-perm</button>
      <button onClick={() => props.onPermissionsSearchChange("read")}>search-perm</button>
      <button onClick={() => props.onPermissionsTypeFilterChange("2")}>filter-perm</button>
      <button onClick={() => props.onPermissionsPageChange(3)}>page-perm</button>
      <span>selected-perms:{props.selectedPermissions.join(",")}</span>
      <span>total-pages:{props.totalPermissionPages}</span>
    </div>
  ),
}));
vi.mock("./membership-footer", () => ({
  MembershipFooter: (props: { onEdit: () => void; onSave: () => void; onCancel: () => void; onUnassign: () => void }) => (
    <div data-testid="footer">
      <button onClick={props.onEdit}>edit</button>
      <button onClick={props.onSave}>save</button>
      <button onClick={props.onCancel}>cancel</button>
      <button onClick={props.onUnassign}>unassign</button>
    </div>
  ),
}));
vi.mock("../remove-membership", () => ({
  RemoveMembership: (props: { open?: boolean; onSuccess: () => void }) =>
    props.open ? (
      <div data-testid="remove-modal">
        <button onClick={props.onSuccess}>remove-success</button>
      </div>
    ) : null,
}));

import { EditMembership } from "./index";

const membership = {
  organizationId: "org-1",
  roles: ["slug-a"],
  permissions: ["perm-x"],
} as never;

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  membership,
  organizationName: "Acme Org",
  userId: "user-1",
  projectKey: "tenant-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  userData = { data: { memberships: [{ organizationId: "org-1", roles: [], permissions: [] }] } };
  rolesData = { data: [{ name: "Admin", slug: "slug-a" }, { name: "Viewer", slug: "slug-b" }] };
  permissionsData = { data: [{ name: "perm-x" }], totalCount: 25 };
  updateUser.mockResolvedValue({ isSuccess: true });
});

describe("EditMembership", () => {
  it("renders the organization title and both tabs", () => {
    render(<EditMembership {...baseProps} />);
    expect(screen.getByText("Acme Org")).toBeInTheDocument();
    expect(screen.getByTestId("roles-tab")).toBeInTheDocument();
    expect(screen.getByTestId("perms-tab")).toBeInTheDocument();
  });

  it("resolves a role display name from its slug and computes page count", () => {
    render(<EditMembership {...baseProps} />);
    expect(screen.getByText("role-name:Admin")).toBeInTheDocument();
    // 25 / 10 -> 3 pages.
    expect(screen.getByText("total-pages:3")).toBeInTheDocument();
  });

  it("seeds selections from the membership when opened", () => {
    render(<EditMembership {...baseProps} />);
    expect(screen.getByText("selected-roles:slug-a")).toBeInTheDocument();
    expect(screen.getByText("selected-perms:perm-x")).toBeInTheDocument();
  });

  it("toggles roles and permissions", async () => {
    const user = userEvent.setup();
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("toggle-role"));
    expect(screen.getByText("selected-roles:slug-a,role-1")).toBeInTheDocument();
    await user.click(screen.getByText("toggle-perm"));
    expect(screen.getByText("selected-perms:perm-x,perm-1")).toBeInTheDocument();
  });

  it("filters roles by search text", async () => {
    const user = userEvent.setup();
    render(<EditMembership {...baseProps} />);
    // Both roles present initially.
    expect(screen.getByText("filtered:2")).toBeInTheDocument();
    await user.click(screen.getByText("search-role"));
    // "admin" only matches Admin.
    expect(screen.getByText("filtered:1")).toBeInTheDocument();
  });

  it("saves memberships and shows success", async () => {
    const user = userEvent.setup();
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("save"));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "user-1", projectKey: "tenant-1" }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the update response is unsuccessful", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({ isSuccess: false, errors: "bad" });
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("save"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });

  it("handles a thrown error with errors payload", async () => {
    const user = userEvent.setup();
    isErr = true;
    updateUser.mockRejectedValue({ errors: "network" });
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("save"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "network" }));
  });

  it("handles a thrown error without an errors payload", async () => {
    const user = userEvent.setup();
    isErr = false;
    updateUser.mockRejectedValue(new Error("boom"));
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("save"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });

  it("opens the remove modal and closes the sheet on unassign success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditMembership {...baseProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("unassign"));
    expect(screen.getByTestId("remove-modal")).toBeInTheDocument();
    await user.click(screen.getByText("remove-success"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels edit mode restoring selections", async () => {
    const user = userEvent.setup();
    render(<EditMembership {...baseProps} />);
    await user.click(screen.getByText("edit"));
    await user.click(screen.getByText("toggle-role"));
    await user.click(screen.getByText("cancel"));
    // Back to the original single selection.
    expect(screen.getByText("selected-roles:slug-a")).toBeInTheDocument();
  });
});
