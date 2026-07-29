import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let usersResult: Record<string, unknown>;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUsers: () => usersResult,
}));

vi.mock("./users-filter-toolbar", () => ({
  UsersFilterToolbar: () => <div data-testid="toolbar" />,
  useUsersFilterQueryParams: () => ({
    queryParams: { page: 0, pageSize: 10, email: "", name: "" },
    setQueryParams: vi.fn(),
  }),
  useUsersSortQueryParams: () => ({ sortQueryParams: [] }),
}));
vi.mock("./users-table", () => ({
  UsersTable: ({ users, isLoading }: { users: unknown[]; isLoading: boolean }) => (
    <div data-testid="table">{isLoading ? "loading" : `${users.length} users`}</div>
  ),
}));

import { Users } from "./users";

beforeEach(() => {
  usersResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }], totalCount: 1 } };
});
afterEach(() => vi.clearAllMocks());

describe("Users", () => {
  it("renders the toolbar and users table", () => {
    render(<Users />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("table")).toHaveTextContent("1 users");
  });

  it("shows loading while fetching", () => {
    usersResult = { isLoading: false, isFetching: true, data: undefined };
    render(<Users />);
    expect(screen.getByTestId("table")).toHaveTextContent("loading");
  });

  it("shows pagination when the total exceeds the page size", () => {
    usersResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }], totalCount: 50 } };
    render(<Users />);
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });
});
