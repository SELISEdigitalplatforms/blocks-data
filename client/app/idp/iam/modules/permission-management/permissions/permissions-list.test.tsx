import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();

vi.mock("./permissions-filter-toolbar", () => ({
  usePermissionsSortQuaryParams: () => ({ sortQueryParams: {}, setSortQueryParams: vi.fn() }),
}));
vi.mock("@/components/filter-toolbar", () => ({
  FilterControls: { SortHeader: ({ label }: { label: string }) => <span>{label}</span> },
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { PermissionsList } from "./permissions-list";

const perm = (over: Record<string, unknown> = {}) => ({
  itemId: "perm-1",
  name: "Read Users",
  type: 1,
  description: "reads users",
  resource: "users.read",
  resourceGroup: "Users",
  projectKey: "t1",
  tags: ["alpha", "beta", "gamma"],
  roles: ["r1", "r2"],
  dependentPermissions: [],
  isArchived: false,
  isBuiltIn: false,
  language: null,
  organizationIds: [],
  permissionSeverity: 2,
  ...over,
});

const renderList = (props: { permissions?: unknown[]; isLoading?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <PermissionsList permissions={(props.permissions ?? [perm()]) as never} isLoading={!!props.isLoading} />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("PermissionsList", () => {
  it("shows skeletons while loading", () => {
    const { container } = renderList({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a permission row with resolved type, source and roles count", () => {
    renderList();
    expect(screen.getByText("Read Users")).toBeInTheDocument();
    expect(screen.getByText("users.read")).toBeInTheDocument();
    // type 1 -> Endpoint via ResourceType enum.
    expect(screen.getByText("Endpoint")).toBeInTheDocument();
    // custom source badge.
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // first tag + overflow counter.
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("2+")).toBeInTheDocument();
  });

  it("renders the Built In badge for built-in permissions", () => {
    renderList({ permissions: [perm({ isBuiltIn: true })] });
    expect(screen.getByText("Built In")).toBeInTheDocument();
  });

  it("navigates to the detail page when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("Read Users"));
    expect(navigateMock).toHaveBeenCalledWith("/services/iam/permission-detail/perm-1");
  });

  it("shows the empty state when there are no permissions", () => {
    renderList({ permissions: [] });
    expect(
      screen.getByText("No permission found. Please create new permission."),
    ).toBeInTheDocument();
  });
});
