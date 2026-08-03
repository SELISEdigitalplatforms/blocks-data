import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let orgResult: Record<string, unknown>;
let orgConfig: Record<string, unknown> | undefined;
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useGetOrganizations: () => orgResult,
  useGetOrganizationConfig: () => ({ data: orgConfig }),
}));

const setQueryParams = vi.fn();
vi.mock("./organizations-filter-toolbar", () => ({
  OrganizationsFilterToolbar: () => <div data-testid="toolbar" />,
  useOrganizationsFilterQueryParams: () => ({
    queryParams: { page: 0, pageSize: 10, search: "" },
    setQueryParams,
  }),
  useOrganizationsSortQueryParams: () => ({ sortQueryParams: [] }),
}));

vi.mock("./organizations-list", () => ({
  OrganizationsList: ({ organizations, isLoading }: { organizations: unknown[]; isLoading: boolean }) => (
    <div data-testid="list">{isLoading ? "loading" : `${organizations.length} orgs`}</div>
  ),
}));

let addDisabled = false;
vi.mock("../add-organization/add-organization", () => ({
  AddOrganization: ({ disabled }: { disabled: boolean }) => {
    addDisabled = disabled;
    return <button type="button" data-testid="add" disabled={disabled}>Add</button>;
  },
}));

import { Organizations } from "./organizations";

beforeEach(() => {
  orgResult = { isLoading: false, isFetching: false, data: { organizations: [{ id: 1 }], totalCount: 1 } };
  orgConfig = { isMultiOrgEnabled: true, allowCreationFromCloud: true };
});
afterEach(() => vi.clearAllMocks());

describe("Organizations", () => {
  it("renders the toolbar, list and enables add when org config allows it", () => {
    render(<Organizations />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("1 orgs");
    expect(addDisabled).toBe(false);
  });

  it("disables add when multi-org is not enabled", () => {
    orgConfig = { isMultiOrgEnabled: false, allowCreationFromCloud: true };
    render(<Organizations />);
    expect(screen.getByTestId("add")).toBeDisabled();
  });

  it("shows loading state while fetching", () => {
    orgResult = { isLoading: true, isFetching: false, data: undefined };
    render(<Organizations />);
    expect(screen.getByTestId("list")).toHaveTextContent("loading");
  });

  it("shows pagination when the total exceeds the page size", () => {
    orgResult = { isLoading: false, isFetching: false, data: { organizations: [{ id: 1 }], totalCount: 25 } };
    render(<Organizations />);
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });
});
