import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IRole } from "@blocks-idp/iam/models/role";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const deleteRoles = vi.fn();
let isErr = false;
let roles: IRole[];

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserRoles: () => ({ isLoading: false, roles, deleteRoles }),
}));
vi.mock("./add-user-role", () => ({ AddUserRole: () => <div>add-user-role</div> }));
vi.mock("./user-roles-list", () => ({
  UserRolesList: ({
    roles: rs,
    onRemoveRole,
  }: {
    roles: IRole[];
    onRemoveRole: (slug: string) => void;
  }) => (
    <ul>
      {rs.map((r) => (
        <li key={r.slug}>
          {r.name}
          <button onClick={() => onRemoveRole(r.slug)}>remove-{r.slug}</button>
        </li>
      ))}
    </ul>
  ),
}));

import { UserRoles } from "./user-roles";

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  roles = [
    { itemId: "1", name: "Admin", slug: "admin" } as IRole,
    { itemId: "2", name: "Viewer", slug: "viewer" } as IRole,
  ];
  deleteRoles.mockResolvedValue({ isSuccess: true });
});

describe("UserRoles", () => {
  it("renders the fetched roles", () => {
    render(<UserRoles id="u1" projectKey="t1" />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("reveals Reset and Save after removing a role", async () => {
    const user = userEvent.setup();
    render(<UserRoles id="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-admin"));
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("restores the roles on Reset", async () => {
    const user = userEvent.setup();
    render(<UserRoles id="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-admin"));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("saves the removed roles and reports success", async () => {
    const user = userEvent.setup();
    render(<UserRoles id="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-viewer"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(deleteRoles).toHaveBeenCalledWith(["viewer"]));
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Roles updated successfully" });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    deleteRoles.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<UserRoles id="u1" projectKey="t1" />);
    await user.click(screen.getByText("remove-viewer"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
