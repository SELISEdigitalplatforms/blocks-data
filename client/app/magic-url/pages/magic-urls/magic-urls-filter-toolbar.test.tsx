import { render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let onChange: (key: string, value: unknown) => void;
let onReset: () => void;
const useSortQueryParams = vi.fn(() => ({ sortQueryParams: {}, setSortQueryParams: vi.fn(), reset: vi.fn() }));
vi.mock("@/components/filter-toolbar", () => ({
  FilterToolbar: (props: { onChange: typeof onChange; onReset: typeof onReset }) => {
    onChange = props.onChange;
    onReset = props.onReset;
    return <div data-testid="filter-toolbar" />;
  },
  useSortQueryParams: (a: unknown) => useSortQueryParams(a),
}));

const setQueryParams = vi.fn();
let queryParams: Record<string, unknown> = {
  search: "",
  expiryStartDate: "",
  expiryEndDate: "",
  status: "",
  requestMethod: "",
  type: "",
};
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryParams, setQueryParams],
  parseAsInteger: { withDefault: (d: unknown) => d },
  parseAsString: { withDefault: (d: unknown) => d },
}));

import {
  MagicUrlsFilterToolBar,
  useMagicUrlSortQueryParams,
} from "./magic-urls-filter-toolbar";

afterEach(() => {
  vi.clearAllMocks();
  queryParams = { search: "", expiryStartDate: "", expiryEndDate: "", status: "", requestMethod: "", type: "" };
});

describe("MagicUrlsFilterToolBar", () => {
  it("renders the filter toolbar", () => {
    const { getByTestId } = render(<MagicUrlsFilterToolBar />);
    expect(getByTestId("filter-toolbar")).toBeInTheDocument();
  });

  it("converts a date range into ISO start/end dates", () => {
    render(<MagicUrlsFilterToolBar />);
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date("2024-02-01T00:00:00.000Z");
    onChange("expiryDate", { from, to });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({})).toEqual({
      expiryStartDate: from.toISOString(),
      expiryEndDate: to.toISOString(),
      page: 0,
    });
  });

  it("falls back to a single provided date for both endpoints", () => {
    render(<MagicUrlsFilterToolBar />);
    const from = new Date("2024-03-01T00:00:00.000Z");
    onChange("expiryDate", { from });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    const result = updater({}) as { expiryStartDate: string; expiryEndDate: string };
    expect(result.expiryStartDate).toBe(from.toISOString());
    expect(result.expiryEndDate).toBe(from.toISOString());
  });

  it("clears the dates when the range is null", () => {
    render(<MagicUrlsFilterToolBar />);
    onChange("expiryDate", null);
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({})).toEqual({ expiryStartDate: "", expiryEndDate: "", page: 0 });
  });

  it("passes through other filter keys and resets the page", () => {
    render(<MagicUrlsFilterToolBar />);
    onChange("status", "Active");
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({ z: 1 })).toEqual({ z: 1, status: "Active", page: 0 });
  });

  it("resets all query params", () => {
    render(<MagicUrlsFilterToolBar />);
    onReset();
    expect(setQueryParams).toHaveBeenCalledWith(null);
  });

  it("exposes a sort query param hook with the OperationName default", () => {
    renderHook(() => useMagicUrlSortQueryParams());
    expect(useSortQueryParams).toHaveBeenCalledWith({
      initial: { property: "OperationName", isDescending: false },
    });
  });
});
