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
vi.mock("@/components/date-range-filter/date-range-filter", () => ({
  DateRangeFilter: () => <div data-testid="date-range" />,
}));

import { UsersRoleTableToolbar } from "./users-role-table-toolbar";

function makeTable() {
  return {
    getColumn: vi.fn((id: string) => ({ id, setFilterValue: vi.fn() })),
    resetColumnFilters: vi.fn(),
  } as never;
}

afterEach(() => {
  vi.clearAllMocks();
  isMobile = false;
  serviceBarOpen = false;
  activeCount = 0;
  lastSearch = undefined;
});

describe("UsersRoleTableToolbar", () => {
  it("renders the search input and faceted filters", () => {
    const table = makeTable();
    render(<UsersRoleTableToolbar table={table} />);
    expect(screen.getAllByTestId("search").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("faceted").length).toBeGreaterThan(0);
  });

  it("pushes typed search text into the name column filter", () => {
    const setFilterValue = vi.fn();
    const table = {
      getColumn: vi.fn((id: string) => (id === "name" ? { setFilterValue } : { id })),
      resetColumnFilters: vi.fn(),
    } as never;
    render(<UsersRoleTableToolbar table={table} />);
    lastSearch?.("alice");
    expect(setFilterValue).toHaveBeenCalledWith("alice");
  });

  it("shows a Reset button and clears filters when filtered", () => {
    activeCount = 2;
    const table = makeTable();
    render(<UsersRoleTableToolbar table={table} />);
    const resetButtons = screen.getAllByRole("button", { name: /Reset/ });
    fireEvent.click(resetButtons[0]);
    expect((table as any).resetColumnFilters).toHaveBeenCalled();
  });
});
