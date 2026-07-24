import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createContext } from "react";

const h = vi.hoisted(() => {
  const setFilter = vi.fn();
  const resetFilter = vi.fn();
  return { setFilter, resetFilter };
});

let onChange: (key: string, value: unknown) => void;
let onReset: () => void;
vi.mock("@/components/filter-toolbar", () => ({
  FilterToolbar: (props: { onChange: typeof onChange; onReset: typeof onReset }) => {
    onChange = props.onChange;
    onReset = props.onReset;
    return <div data-testid="filter-toolbar" />;
  },
}));

vi.mock("../logs-viewer", () => ({
  LogsViewerContext: createContext({
    filter: { level: "", startDate: "", endDate: "", search: "" },
    setFilter: h.setFilter,
    resetFilter: h.resetFilter,
  }),
}));

import { LogsFilterToolbar } from "./logs-filter-toolbar";

afterEach(() => vi.clearAllMocks());

describe("LogsFilterToolbar", () => {
  it("renders the filter toolbar", () => {
    const { getByTestId } = render(<LogsFilterToolbar />);
    expect(getByTestId("filter-toolbar")).toBeInTheDocument();
  });

  it("updates a plain filter key via setFilter", () => {
    render(<LogsFilterToolbar />);
    onChange("search", "error");
    const updater = h.setFilter.mock.calls[0][0] as (f: object) => object;
    expect(updater({ existing: 1 })).toEqual({ existing: 1, search: "error" });
  });

  it("converts the date range into ISO start/end dates", () => {
    render(<LogsFilterToolbar />);
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date("2024-02-01T00:00:00.000Z");
    onChange("date", { from, to });
    const updater = h.setFilter.mock.calls[0][0] as (f: object) => object;
    expect(updater({})).toEqual({
      startDate: from.toISOString(),
      endDate: to.toISOString(),
    });
  });

  it("clears the dates when the range is null", () => {
    render(<LogsFilterToolbar />);
    onChange("date", null);
    const updater = h.setFilter.mock.calls[0][0] as (f: object) => object;
    expect(updater({})).toEqual({ startDate: "", endDate: "" });
  });

  it("delegates the reset action", () => {
    render(<LogsFilterToolbar />);
    onReset();
    expect(h.resetFilter).toHaveBeenCalled();
  });
});
