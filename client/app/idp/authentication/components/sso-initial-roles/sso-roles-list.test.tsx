import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { IRole } from "@blocks-idp/iam/models/role";

const navigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("./delete-sso-role", () => ({
  DeleteSSORole: ({ role }: { role: IRole }) => (
    <button data-testid={`delete-${role.itemId}`}>delete</button>
  ),
}));

import { SSORolesList } from "./sso-roles-list";

const role = (over: Partial<IRole> = {}): IRole =>
  ({ itemId: "r1", name: "Admin", slug: "admin", ...over }) as IRole;

const renderList = (roles: IRole[], onDelete = vi.fn()) =>
  render(
    <MemoryRouter>
      <SSORolesList roles={roles} onDelete={onDelete} />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("SSORolesList", () => {
  it("renders the column headers", () => {
    renderList([role()]);
    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByText("Slug")).toBeInTheDocument();
  });

  it("shows the empty placeholder with no roles", () => {
    renderList([]);
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });

  it("renders a row with the role name and slug badge", () => {
    renderList([role({ name: "Viewer", slug: "viewer" })]);
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
  });

  it("navigates to the role detail page when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList([role({ itemId: "role-42", name: "Viewer" })]);
    await user.click(screen.getByText("Viewer"));
    expect(navigate).toHaveBeenCalledWith("/services/iam/role-detail/role-42");
  });

  it("renders the delete control per row without triggering row navigation", async () => {
    const user = userEvent.setup();
    renderList([role({ itemId: "role-9" })]);
    await user.click(screen.getByTestId("delete-role-9"));
    expect(navigate).not.toHaveBeenCalled();
  });
});
