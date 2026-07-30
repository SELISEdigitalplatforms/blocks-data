import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setQueryParams = vi.fn();
let queryParams: Record<string, unknown> = {
  "sort-property": "",
  "sort-isDescending": false,
};

vi.mock("nuqs", () => ({
  useQueryStates: () => [queryParams, setQueryParams],
  parseAsString: { withDefault: (d: string) => d },
  parseAsBoolean: { withDefault: (d: boolean) => d },
}));

import { SortHeader, useSortQueryParams } from "./sort-header";

describe("SortHeader", () => {
  it("renders its label", () => {
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "", isDescending: false }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("activates ascending sort on first click of an inactive header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "", isDescending: false }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: false });
  });

  it("toggles to descending when clicking the already-active ascending header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "name", isDescending: false }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: true });
  });

  it("resets to ascending when clicking a different, currently-active header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "date", isDescending: true }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: false });
  });

  it.each([["{Enter}"], [" "]])("sorts when %s is pressed on the header", async (key) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "", isDescending: false }}
        onChange={onChange}
      />,
    );

    screen.getByRole("button").focus();
    await user.keyboard(key);

    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: false });
  });
});

describe("useSortQueryParams", () => {
  beforeEach(() => {
    setQueryParams.mockReset();
    queryParams = { "sort-property": "", "sort-isDescending": false };
  });

  it("exposes the query state as a SortValue", () => {
    queryParams = { "sort-property": "name", "sort-isDescending": true };
    const { result } = renderHook(() => useSortQueryParams({}));

    expect(result.current.sortQueryParams).toEqual({
      property: "name",
      isDescending: true,
    });
  });

  it("writes both sort keys when the sort changes", () => {
    const { result } = renderHook(() => useSortQueryParams({}));

    result.current.setSortQueryParams({ property: "date", isDescending: true });

    expect(setQueryParams).toHaveBeenCalledTimes(1);
    const updater = setQueryParams.mock.calls[0][0] as () => unknown;
    expect(updater()).toEqual({
      "sort-property": "date",
      "sort-isDescending": true,
    });
  });

  it("clears the query state on reset", () => {
    const { result } = renderHook(() => useSortQueryParams({}));

    result.current.reset();

    expect(setQueryParams).toHaveBeenCalledWith(null);
  });
});
