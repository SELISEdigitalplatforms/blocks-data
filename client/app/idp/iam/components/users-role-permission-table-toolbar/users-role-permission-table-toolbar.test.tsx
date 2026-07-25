import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let isMobile = false;
let serviceBarOpen = false;
let activeCount = 0;
vi.mock("@/hooks/use-is-mobile", () => ({ default: () => isMobile }));
vi.mock("@/hooks/use-is-service-tab-open-local", () => ({ default: () => serviceBarOpen }));
vi.mock("@/hooks/use-active-filters-count", () => ({
  useActiveFiltersCount: () => activeCount,
}));

let lastSearch: ((t: string) => void) | undefined;
vi.mock("@/components/search-input/search-input", () => ({
  SearchInput: ({ onSearch }: { onSearch: (t: string) => void }) => {
    lastSearch = onSearch;
    return <input data-testid="search" onChange={(e) => onSearch(e.target.value)} />;
  },
}));
vi.mock("@/components/data-table-faceted-filter/data-table-faceted-filter", () => ({
  DataTableFacetedFilter: () => <div data-testid="faceted" />,
}));

import { UsersRolePermissionTableToolbar } from "./users-role-permission-table-toolbar";

function makeTable(setFilterValue = vi.fn()) {
  return {
    getColumn: vi.fn((id: string) => ({ id, setFilterValue })),
    resetColumnFilters: vi.fn(),
    getRowModel: vi.fn(() => ({
      rows: [
        { original: { resourceGroup: "users" } },
        { original: { resourceGroup: "roles" } },
      ],
    })),
  } as never;
}

afterEach(() => {
  vi.clearAllMocks();
  isMobile = false;
  serviceBarOpen = false;
  activeCount = 0;
  lastSearch = undefined;
});

describe("UsersRolePermissionTableToolbar", () => {
  it("renders the search input and a group faceted filter", () => {
    render(<UsersRolePermissionTableToolbar table={makeTable()} />);
    expect(screen.getAllByTestId("search").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("faceted").length).toBeGreaterThan(0);
  });

  it("pushes typed search text into the name column filter", () => {
    const setFilterValue = vi.fn();
    render(<UsersRolePermissionTableToolbar table={makeTable(setFilterValue)} />);
    lastSearch?.("read");
    expect(setFilterValue).toHaveBeenCalledWith("read");
  });

  it("clears filters via the Reset button when filtered", () => {
    activeCount = 1;
    const table = makeTable();
    render(<UsersRolePermissionTableToolbar table={table} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Reset/ })[0]);
    expect((table as any).resetColumnFilters).toHaveBeenCalled();
  });
});
