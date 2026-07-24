import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();

vi.mock("./roles-filter-toolbar", () => ({
  useRolesSortQueryParams: () => ({ sortQueryParams: {}, setSortQueryParams: vi.fn() }),
}));
vi.mock("@/components/filter-toolbar", () => ({
  FilterControls: { SortHeader: ({ label }: { label: string }) => <span>{label}</span> },
}));
vi.mock("../update-role/update-role", () => ({
  UpdateRole: ({ role }: { role: { name: string } }) => (
    <div data-testid="update-role">editing:{role.name}</div>
  ),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { RolesList } from "./roles-list";

const role = (over: Record<string, unknown> = {}) => ({
  itemId: "role-1",
  name: "Administrator",
  slug: "admin",
  count: 12,
  description: "Full access",
  ...over,
});

const renderList = (props: { roles?: unknown[]; isLoading?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <RolesList roles={(props.roles ?? [role()]) as never} isLoading={!!props.isLoading} />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("RolesList", () => {
  it("shows skeletons while loading", () => {
    const { container } = renderList({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a role row with name, slug and permission count", () => {
    renderList();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Full access")).toBeInTheDocument();
  });

  it("shows the empty state when there are no roles", () => {
    renderList({ roles: [] });
    expect(screen.getByText("No roles found. Please create new roles.")).toBeInTheDocument();
  });

  it("navigates to the role detail page on row click", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("Administrator"));
    expect(navigateMock).toHaveBeenCalledWith("/services/iam/role-detail/role-1");
  });

  it("opens the update-role dialog from the edit action without navigating", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "" }));
    expect(await screen.findByTestId("update-role")).toHaveTextContent("editing:Administrator");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
