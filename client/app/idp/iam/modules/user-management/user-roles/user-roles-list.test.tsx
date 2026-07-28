import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserRolesList } from "./user-roles-list";
import type { IRole } from "@blocks-idp/iam/models/role";

const roles = [
  { itemId: "1", name: "Admin", slug: "admin" },
  { itemId: "2", name: "Editor", slug: "editor" },
] as IRole[];

describe("UserRolesList", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = render(
      <UserRolesList
        roles={[]}
        isLoading
        userId="u1"
        projectKey="t1"
        onRemoveRole={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders each role with its name and slug", () => {
    render(
      <UserRolesList
        roles={roles}
        isLoading={false}
        userId="u1"
        projectKey="t1"
        onRemoveRole={vi.fn()}
      />,
    );
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("calls onRemoveRole with the role slug when the remove button is clicked", () => {
    const onRemoveRole = vi.fn();
    render(
      <UserRolesList
        roles={roles}
        isLoading={false}
        userId="u1"
        projectKey="t1"
        onRemoveRole={onRemoveRole}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("Remove role")[0]);
    expect(onRemoveRole).toHaveBeenCalledWith("admin");
  });

  it("shows an empty state when there are no roles", () => {
    render(
      <UserRolesList
        roles={[]}
        isLoading={false}
        userId="u1"
        projectKey="t1"
        onRemoveRole={vi.fn()}
      />,
    );
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });
});
