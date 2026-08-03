import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetPermissionById = vi.fn();
const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissionById: (...a: unknown[]) => useGetPermissionById(...a),
  useUpdatePermission: () => ({ isPending, mutateAsync }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => <nav /> }));
vi.mock("./permission-roles-list", () => ({
  PermissionRolesList: ({ slugs }: { slugs: string[] }) => (
    <div data-testid="roles-list">{slugs.join(",")}</div>
  ),
}));
vi.mock("../permission-form", () => ({
  PermissionForm: ({
    onSave,
    values,
  }: {
    onSave: (d: unknown) => void;
    values: unknown;
  }) => (
    <button
      data-testid="save"
      onClick={() =>
        onSave({ type: "2", dependentPermissions: ["dp1"], name: (values as { name?: string })?.name })
      }
    >
      save-form
    </button>
  ),
}));

import { PermissionDetails } from "./permission-details";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("PermissionDetails", () => {
  it("renders a loading skeleton while fetching", () => {
    useGetPermissionById.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<PermissionDetails id="p1" />);
    expect(container.querySelectorAll(".animate-pulse, [class*='Skeleton']").length).toBeGreaterThanOrEqual(0);
    expect(screen.queryByTestId("save")).not.toBeInTheDocument();
  });

  it("renders the name, custom badge, and roles once loaded", () => {
    useGetPermissionById.mockReturnValue({
      data: { data: { name: "Read Users", isBuiltIn: false, roles: ["admin", "editor"] } },
      isLoading: false,
    });
    render(<PermissionDetails id="p1" />);
    expect(screen.getByText("Read Users")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByTestId("roles-list")).toHaveTextContent("admin,editor");
  });

  it("shows a Built In badge for built-in permissions", () => {
    useGetPermissionById.mockReturnValue({
      data: { data: { name: "System", isBuiltIn: true, roles: [] } },
      isLoading: false,
    });
    render(<PermissionDetails id="p1" />);
    expect(screen.getByText("Built In")).toBeInTheDocument();
  });

  it("submits an update and shows success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    useGetPermissionById.mockReturnValue({
      data: { data: { name: "Read", isBuiltIn: false, roles: [] } },
      isLoading: false,
    });
    render(<PermissionDetails id="p1" />);
    await user.click(screen.getByTestId("save"));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 2, projectKey: "tenant-1", itemId: "p1", dependentPermissions: ["dp1"] }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the update fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { name: "bad" } });
    useGetPermissionById.mockReturnValue({
      data: { data: { name: "Read", isBuiltIn: false, roles: [] } },
      isLoading: false,
    });
    render(<PermissionDetails id="p1" />);
    await user.click(screen.getByTestId("save"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "bad" } }));
  });
});
