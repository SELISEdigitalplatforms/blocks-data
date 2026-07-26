import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { User } from "@blocks-idp/iam/models/user";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("./organization-users-filter-toolbar", () => ({
  useOrganizationUsersSortQueryParams: () => ({
    sortQueryParams: { property: "FirstName", isDescending: false },
    setSortQueryParams: vi.fn(),
  }),
}));

import { OrganizationUsersTable } from "./organization-users-table";

const user = (over: Partial<User> = {}): User =>
  ({
    itemId: "u1",
    firstName: "Grace",
    lastName: "Hopper",
    email: "GRACE@EXAMPLE.COM",
    logInCount: 3,
    lastLoggedInTime: "2024-03-04T09:00:00Z",
    active: true,
    ...over,
  }) as User;

const renderTable = (users: User[], isLoading = false) =>
  render(
    <MemoryRouter>
      <OrganizationUsersTable users={users} isLoading={isLoading} />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("OrganizationUsersTable", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = renderTable([], true);
    expect(container.querySelectorAll(".rounded-lg").length).toBeGreaterThan(0);
  });

  it("renders headers and a populated row", () => {
    renderTable([user()]);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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
    renderTable([user({ itemId: "org-user-9" })]);
    await u.click(screen.getByText("Grace Hopper"));
    expect(navigate).toHaveBeenCalledWith("/services/iam/user-detail/org-user-9");
  });
});
