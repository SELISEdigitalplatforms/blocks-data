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
  OrganizationUsersFilterToolbar,
  useOrganizationUsersSortQueryParams,
} from "./organization-users-filter-toolbar";

afterEach(() => {
  vi.clearAllMocks();
  queryParams = { "selected-filter": "name", name: "", email: "" };
});

describe("OrganizationUsersFilterToolbar", () => {
  it("renders the filter toolbar", () => {
    const { getByTestId } = render(<OrganizationUsersFilterToolbar />);
    expect(getByTestId("filter-toolbar")).toBeInTheDocument();
  });

  it("maps a name search into name query params and resets the page", () => {
    render(<OrganizationUsersFilterToolbar />);
    onChange("search", { selected: "name", value: "bob" });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({})).toEqual({
      "selected-filter": "name",
      name: "bob",
      email: "",
      page: 0,
    });
  });

  it("maps an email search into email query params", () => {
    render(<OrganizationUsersFilterToolbar />);
    onChange("search", { selected: "email", value: "b@c.com" });
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({})).toEqual({
      "selected-filter": "email",
      name: "",
      email: "b@c.com",
      page: 0,
    });
  });

  it("passes through other keys and resets the page", () => {
    render(<OrganizationUsersFilterToolbar />);
    onChange("page", 3);
    const updater = setQueryParams.mock.calls[0][0] as (p: object) => object;
    expect(updater({ y: 2 })).toEqual({ y: 2, page: 0 });
  });

  it("resets all query params", () => {
    render(<OrganizationUsersFilterToolbar />);
    onReset();
    expect(setQueryParams).toHaveBeenCalledWith(null);
  });

  it("exposes a sort query param hook with the FirstName default", () => {
    renderHook(() => useOrganizationUsersSortQueryParams());
    expect(useSortQueryParams).toHaveBeenCalledWith({
      initial: { property: "FirstName", isDescending: false },
    });
  });
});
