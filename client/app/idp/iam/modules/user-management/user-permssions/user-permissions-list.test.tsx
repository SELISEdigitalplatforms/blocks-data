import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserPermissionsList } from "./user-permissions-list";
import type { IPermission } from "@blocks-idp/iam/models/permission";

const permissions = [
  { itemId: "1", name: "Read", resource: "users:read" },
  { itemId: "2", name: "Write", resource: "users:write" },
] as IPermission[];

describe("UserPermissionsList", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = render(
      <UserPermissionsList
        permissions={[]}
        isLoading
        userId="u1"
        onRemovePermission={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders each permission with its name and resource", () => {
    render(
      <UserPermissionsList
        permissions={permissions}
        isLoading={false}
        userId="u1"
        onRemovePermission={vi.fn()}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("users:read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  it("calls onRemovePermission with the resource when the remove button is clicked", () => {
    const onRemovePermission = vi.fn();
    render(
      <UserPermissionsList
        permissions={permissions}
        isLoading={false}
        userId="u1"
        onRemovePermission={onRemovePermission}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("Remove role")[1]);
    expect(onRemovePermission).toHaveBeenCalledWith("users:write");
  });

  it("shows an empty state when there are no permissions", () => {
    render(
      <UserPermissionsList
        permissions={[]}
        isLoading={false}
        userId="u1"
        onRemovePermission={vi.fn()}
      />,
    );
    expect(screen.getByText("No permission found")).toBeInTheDocument();
  });
});
