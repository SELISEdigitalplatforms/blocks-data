import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let rolesResult: Record<string, unknown>;
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => rolesResult,
}));

vi.mock("./roles-filter-toolbar", () => ({
  RolesFilterToolBar: () => <div data-testid="toolbar" />,
  useRolesFilterQueryParams: () => ({
    queryParams: { page: 0, pageSize: 10, search: "" },
    setQueryParams: vi.fn(),
  }),
  useRolesSortQueryParams: () => ({ sortQueryParams: [] }),
}));

vi.mock("./roles-list", () => ({
  RolesList: ({ roles, isLoading }: { roles: unknown[]; isLoading: boolean }) => (
    <div data-testid="list">{isLoading ? "loading" : `${roles.length} roles`}</div>
  ),
}));

import { Roles } from "./roles";

beforeEach(() => {
  rolesResult = { isLoading: false, isFetching: false, data: { data: [{ slug: "admin" }], totalCount: 1 } };
});
afterEach(() => vi.clearAllMocks());

describe("Roles", () => {
  it("renders the toolbar and roles list", () => {
    render(<Roles />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("1 roles");
  });

  it("shows loading while fetching", () => {
    rolesResult = { isLoading: false, isFetching: true, data: undefined };
    render(<Roles />);
    expect(screen.getByTestId("list")).toHaveTextContent("loading");
  });

  it("renders pagination when the total exceeds the page size", () => {
    rolesResult = { isLoading: false, isFetching: false, data: { data: [{ slug: "a" }], totalCount: 30 } };
    render(<Roles />);
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });
});
