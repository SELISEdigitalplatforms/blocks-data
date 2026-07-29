import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { User } from "@blocks-idp/iam/models/user";

const navigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("./users-filter-toolbar", () => ({
  useUsersSortQueryParams: () => ({
    sortQueryParams: { property: "FirstName", isDescending: false },
    setSortQueryParams: vi.fn(),
  }),
}));

import { UsersTable } from "./users-table";

const user = (over: Partial<User> = {}): User =>
  ({
    itemId: "u1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ADA@EXAMPLE.COM",
    logInCount: 7,
    lastLoggedInTime: "2024-03-04T09:00:00Z",
    active: true,
    ...over,
  }) as User;

const renderTable = (users: User[], isLoading = false) =>
  render(
    <MemoryRouter>
      <UsersTable users={users} isLoading={isLoading} />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("UsersTable", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = renderTable([], true);
    expect(container.querySelectorAll(".rounded-lg").length).toBeGreaterThan(0);
    expect(screen.queryByText("No results found.")).not.toBeInTheDocument();
  });

  it("renders the column headers", () => {
    renderTable([user()]);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("No. of logins")).toBeInTheDocument();
    expect(screen.getByText("Last login")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders a row with the user's details and active status", () => {
    renderTable([user()]);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders an inactive status badge", () => {
    renderTable([user({ active: false })]);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows the empty placeholder when there are no users", () => {
    renderTable([]);
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("navigates to the user detail page when a row is clicked", async () => {
    const u = userEvent.setup();
    renderTable([user({ itemId: "user-42" })]);
    await u.click(screen.getByText("Ada Lovelace"));
    expect(navigate).toHaveBeenCalledWith("/services/iam/user-detail/user-42");
  });
});
