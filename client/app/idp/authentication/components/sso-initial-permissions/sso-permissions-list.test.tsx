import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./delete-sso-permission", () => ({
  DeleteSSOPermission: ({ onDelete, permission }: { onDelete: (p: unknown) => void; permission: unknown }) => (
    <button type="button" data-testid="delete" onClick={() => onDelete(permission)}>
      delete
    </button>
  ),
}));

import { SSOPermissionsList } from "./sso-permissions-list";

const permissions = [
  { itemId: "1", name: "Read", resource: "res-read" },
  { itemId: "2", name: "Write", resource: "res-write" },
];

afterEach(() => vi.clearAllMocks());

describe("SSOPermissionsList", () => {
  it("renders the header and one row per permission", () => {
    render(<SSOPermissionsList permissions={permissions as never} onDelete={vi.fn()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Resource")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("res-write")).toBeInTheDocument();
    expect(screen.getAllByTestId("delete")).toHaveLength(2);
  });

  it("shows the empty state when there are no permissions", () => {
    render(<SSOPermissionsList permissions={[]} onDelete={vi.fn()} />);
    expect(screen.getByText("No permissions found")).toBeInTheDocument();
  });

  it("invokes onDelete with the permission when the delete action fires", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<SSOPermissionsList permissions={permissions as never} onDelete={onDelete} />);
    await user.click(screen.getAllByTestId("delete")[0]);
    expect(onDelete).toHaveBeenCalledWith(permissions[0]);
  });
});
