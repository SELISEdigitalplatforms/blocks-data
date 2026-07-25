import { render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let onChange: (key: string, value: string) => void;
let onReset: () => void;
const useSortQueryParams = vi.fn(() => ({
  sortQueryParams: {},
  setSortQueryParams: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/components/filter-toolbar", () => ({
  FilterToolbar: (props: { onChange: typeof onChange; onReset: typeof onReset }) => {
    onChange = props.onChange;
    onReset = props.onReset;
    return <div data-testid="filter-toolbar" />;
  },
  useSortQueryParams: (a: unknown) => useSortQueryParams(a),
}));

const setQueryParams = vi.fn();
let queryParams: Record<string, unknown> = { search: "" };
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryParams, setQueryParams],
  parseAsInteger: { withDefault: (d: unknown) => d },
  parseAsString: { withDefault: (d: unknown) => d },
}));

import { RolesFilterToolBar, useRolesSortQueryParams } from "./roles-filter-toolbar";

afterEach(() => {
  vi.clearAllMocks();
  queryParams = { search: "" };
});

describe("RolesFilterToolBar", () => {
  it("renders the filter toolbar", () => {
    const { getByTestId } = render(<RolesFilterToolBar />);
    expect(getByTestId("filter-toolbar")).toBeInTheDocument();
  });

  it("maps a change into the query params and resets the page", () => {
    render(<RolesFilterToolBar />);
    onChange("search", "admin");
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({ x: 1 })).toEqual({ x: 1, search: "admin", page: 0 });
  });

  it("resets all query params", () => {
    render(<RolesFilterToolBar />);
    onReset();
    expect(setQueryParams).toHaveBeenCalledWith(null);
  });

  it("exposes a sort query param hook with the Name default", () => {
    renderHook(() => useRolesSortQueryParams());
    expect(useSortQueryParams).toHaveBeenCalledWith({
      initial: { property: "Name", isDescending: false },
    });
  });
});
