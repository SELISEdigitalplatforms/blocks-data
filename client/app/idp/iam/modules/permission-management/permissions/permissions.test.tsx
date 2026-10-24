import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let permResult: Record<string, unknown>;
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => permResult,
}));

vi.mock("./permissions-filter-toolbar", () => ({
  PermissionsFilterToolbar: () => <div data-testid="toolbar" />,
  usePermissionsFilterQuaryParams: () => ({
    queryParams: { page: 0, pageSize: 10, isBuiltIn: "", type: "0" },
    setQueryParams: vi.fn(),
  }),
  usePermissionsSortQuaryParams: () => ({ sortQueryParams: [] }),
}));
vi.mock("./permissions-list", () => ({
  PermissionsList: ({ permissions, isLoading }: { permissions: unknown[]; isLoading: boolean }) => (
    <div data-testid="list">{isLoading ? "loading" : `${permissions.length} perms`}</div>
  ),
}));
vi.mock("./permissions-group-severity", () => ({
  PermissionsGroupBySeverity: () => <div data-testid="severity" />,
}));

import { Permissions } from "./permissions";

beforeEach(() => {
  permResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }, { id: 2 }], totalCount: 2 } };
});
afterEach(() => vi.clearAllMocks());

describe("Permissions", () => {
  it("renders severity summary, toolbar and list without a pager when everything fits", () => {
    render(<Permissions />);
    expect(screen.getByTestId("severity")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("2 perms");
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });

  it("shows pagination when the total exceeds the page size", () => {
    permResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }], totalCount: 30 } };
    render(<Permissions />);
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("hides pagination while loading", () => {
    permResult = { isLoading: true, isFetching: false, data: undefined };
    render(<Permissions />);
    expect(screen.getByTestId("list")).toHaveTextContent("loading");
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
  });
});
