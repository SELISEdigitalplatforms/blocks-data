import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storeState: Record<string, unknown> = {};
vi.mock("./role-details-state", () => ({
  RoleDetailsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="provider">{children}</div>
  ),
  useRoleDetailsStore: (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useSetRoles: () => ({ isPending, mutateAsync }),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: () => <nav data-testid="breadcrumb" />,
}));
vi.mock("@blocks-idp/iam/components/permission-severity/permission-severity", () => ({
  PermissionSeverity: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="severity">{isLoading ? "loading" : "ready"}</div>
  ),
}));
vi.mock("./permissions-selection-panel", () => ({
  PermissionsSelectionPanel: () => <div data-testid="panel" />,
}));

import { RoleDetailsContainer, RoleDetails } from "./role-details";

const buildPermissionMap = () =>
  new Map<string, Record<string, unknown>>([
    ["a", { itemId: "a", modified: true, changeState: "added", permissionSeverity: "High", isInitiallyAssigned: false }],
    ["r", { itemId: "r", modified: true, changeState: "removed", permissionSeverity: "Low", isInitiallyAssigned: true }],
    ["k", { itemId: "k", modified: false, changeState: "none", permissionSeverity: "High", isInitiallyAssigned: true }],
  ]);

beforeEach(() => {
  isPending = false;
  Object.assign(storeState, {
    role: { slug: "admin", itemId: "role-1", name: "Admin" },
    isEditMode: false,
    discardChanges: vi.fn(),
    changeEditMode: vi.fn(),
    isInitialized: true,
    permissionMap: buildPermissionMap(),
  });
});
afterEach(() => vi.clearAllMocks());

describe("RoleDetailsContainer", () => {
  it("shows the role name and Edit button when not initialized differently", () => {
    render(<RoleDetailsContainer />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Permissions" })).toBeInTheDocument();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("renders a skeleton instead of the name while not initialized", () => {
    storeState.isInitialized = false;
    render(<RoleDetailsContainer />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByTestId("severity")).toHaveTextContent("loading");
  });

  it("enters edit mode when Edit Permissions is clicked", async () => {
    const user = userEvent.setup();
    render(<RoleDetailsContainer />);
    await user.click(screen.getByRole("button", { name: "Edit Permissions" }));
    expect(storeState.changeEditMode).toHaveBeenCalledWith(true);
  });

  it("shows Discard and Save while editing and discards", async () => {
    const user = userEvent.setup();
    storeState.isEditMode = true;
    render(<RoleDetailsContainer />);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(storeState.discardChanges).toHaveBeenCalled();
  });

  it("saves changed permissions and shows success toast", async () => {
    const user = userEvent.setup();
    storeState.isEditMode = true;
    mutateAsync.mockResolvedValue({});
    render(<RoleDetailsContainer />);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        addPermissions: ["a"],
        removePermissions: ["r"],
        projectKey: "t1",
        slug: "admin",
      }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["permissions"] });
  });

  it("does not save when there are no modified permissions", async () => {
    const user = userEvent.setup();
    storeState.isEditMode = true;
    storeState.permissionMap = new Map();
    render(<RoleDetailsContainer />);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows an error toast when saving fails with errors", async () => {
    const user = userEvent.setup();
    storeState.isEditMode = true;
    mutateAsync.mockRejectedValue({ errors: { name: "bad" } });
    render(<RoleDetailsContainer />);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "bad" } }));
  });
});

describe("RoleDetails", () => {
  it("wraps the container in the provider", () => {
    render(<RoleDetails params={{ id: "role-1" }} />);
    expect(screen.getByTestId("provider")).toBeInTheDocument();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });
});
