import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { IRole } from "@blocks-idp/iam/models/role";

const navigate = vi.fn();
let rolesData: unknown;
let isLoading = false;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading }),
}));
vi.mock("nuqs", () => ({
  useQueryStates: () => [{ page: 0, pageSize: 10 }, vi.fn()],
  parseAsInteger: { withDefault: () => ({}) },
}));

import { PermissionRolesList } from "./permission-roles-list";

const role = (over: Partial<IRole> = {}): IRole =>
  ({ itemId: "r1", name: "Admin", slug: "admin", description: "Full access", ...over }) as IRole;

const renderList = (slugs: string[]) =>
  render(
    <MemoryRouter>
      <PermissionRolesList slugs={slugs} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isLoading = false;
  rolesData = { data: [role()], totalCount: 1 };
});

describe("PermissionRolesList", () => {
  it("renders nothing when there are no slugs", () => {
    const { container } = renderList([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a loading skeleton while loading", () => {
    isLoading = true;
    const { container } = renderList(["admin"]);
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThan(0);
  });

  it("renders headers and a role row", () => {
    renderList(["admin"]);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("Full access")).toBeInTheDocument();
  });

  it("shows the empty placeholder when there are no roles", () => {
    rolesData = { data: [], totalCount: 0 };
    renderList(["admin"]);
    expect(
      screen.getByText("No roles found. Please create new roles."),
    ).toBeInTheDocument();
  });

  it("navigates to the role detail page when a row is clicked", async () => {
    const user = userEvent.setup();
    rolesData = { data: [role({ itemId: "role-77", name: "Ops" })], totalCount: 1 };
    renderList(["ops"]);
    await user.click(screen.getByText("Ops"));
    expect(navigate).toHaveBeenCalledWith("/services/iam/role-detail/role-77");
  });
});
