import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPermission } from "@blocks-idp/iam/models/permission";

const toast = vi.fn();
const deletePermissions = vi.fn();
let permissions: IPermission[];

vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserPermissions: () => ({ permissions, isLoading: false, deletePermissions }),
}));
vi.mock("./add-user-permission", () => ({
  AddUserPermission: () => <div>add-user-permission</div>,
}));
vi.mock("./user-permissions-list", () => ({
  UserPermissionsList: ({
    permissions: ps,
    onRemovePermission,
  }: {
    permissions: IPermission[];
    onRemovePermission: (resource: string) => void;
  }) => (
    <ul>
      {ps.map((p) => (
        <li key={p.resource}>
          {p.name}
          <button onClick={() => onRemovePermission(p.resource)}>remove-{p.resource}</button>
        </li>
      ))}
    </ul>
  ),
}));

import { UserPermissions } from "./user-permissions";

beforeEach(() => {
  vi.clearAllMocks();
  permissions = [
    { itemId: "1", name: "Read", resource: "users:read" } as IPermission,
    { itemId: "2", name: "Write", resource: "users:write" } as IPermission,
  ];
  deletePermissions.mockResolvedValue({ isSuccess: true });
});

describe("UserPermissions", () => {
  it("renders the fetched permissions", () => {
    render(<UserPermissions userId="u1" projectKey="t1" />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("reveals Reset and Save after removing a permission", async () => {
    const user = userEvent.setup();
    render(<UserPermissions userId="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-users:read"));
    expect(screen.queryByText("Read")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves the removed permissions and reports success", async () => {
    const user = userEvent.setup();
    render(<UserPermissions userId="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-users:write"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(deletePermissions).toHaveBeenCalledWith(["users:write"]));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success", description: "Permissions updated successfully" }),
    );
  });

  it("reports a destructive toast when the save is unsuccessful", async () => {
    deletePermissions.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<UserPermissions userId="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-users:write"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});
