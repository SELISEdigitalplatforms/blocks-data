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
  "selected-filter": "name",
  name: "",
  email: "",
};
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryParams, setQueryParams],
  parseAsInteger: { withDefault: (d: unknown) => d },
  parseAsString: { withDefault: (d: unknown) => d },
}));

import {
  UsersFilterToolbar,
  useUsersSortQueryParams,
} from "./users-filter-toolbar";

afterEach(() => {
  vi.clearAllMocks();
  queryParams = { "selected-filter": "name", name: "", email: "" };
});

describe("UsersFilterToolbar", () => {
  it("renders the filter toolbar", () => {
    const { getByTestId } = render(<UsersFilterToolbar />);
    expect(getByTestId("filter-toolbar")).toBeInTheDocument();
  });

  it("maps a name search into name query params and resets the page", () => {
    render(<UsersFilterToolbar />);
    onChange("search", { selected: "name", value: "alice" });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({ foo: 1 })).toEqual({
      foo: 1,
      "selected-filter": "name",
      name: "alice",
      email: "",
      page: 0,
    });
  });

  it("maps an email search into email query params", () => {
    render(<UsersFilterToolbar />);
    onChange("search", { selected: "email", value: "a@b.com" });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({})).toEqual({
      "selected-filter": "email",
      name: "",
      email: "a@b.com",
      page: 0,
    });
  });

  it("passes through other keys and resets the page", () => {
    render(<UsersFilterToolbar />);
    onChange("pageSize", 25);
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({ x: 1 })).toEqual({ x: 1, pageSize: 25, page: 0 });
  });

  it("resets all query params", () => {
    render(<UsersFilterToolbar />);
    onReset();
    expect(setQueryParams).toHaveBeenCalledWith(null);
  });

  it("exposes a sort query param hook with the FirstName default", () => {
    renderHook(() => useUsersSortQueryParams());
    expect(useSortQueryParams).toHaveBeenCalledWith({
      initial: { property: "FirstName", isDescending: false },
    });
  });
});
