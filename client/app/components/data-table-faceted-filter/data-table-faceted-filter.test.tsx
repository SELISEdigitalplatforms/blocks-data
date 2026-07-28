import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Column } from "@tanstack/react-table";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

const options = [
  { label: "Connected", value: "Connected" },
  { label: "Configured", value: "Configured" },
];

function makeColumn(
  filterValue?: { types?: string[] },
  setFilterValue = vi.fn(),
): Column<unknown, unknown> {
  return {
    getFacetedUniqueValues: () => new Map([["Connected", 3]]),
    getFilterValue: () => filterValue,
    setFilterValue,
  } as unknown as Column<unknown, unknown>;
}

describe("DataTableFacetedFilter", () => {
  it("renders the title", () => {
    render(<DataTableFacetedFilter title="Status" options={options} column={makeColumn()} />);
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
  });

  it("shows selected values as badges", () => {
    render(
      <DataTableFacetedFilter
        title="Status"
        options={options}
        column={makeColumn({ types: ["Connected"] })}
      />,
    );
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("adds a value to the column filter when selecting an option", async () => {
    const user = userEvent.setup();
    const setFilterValue = vi.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={options}
        column={makeColumn(undefined, setFilterValue)}
      />,
    );
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Configured"));
    expect(setFilterValue).toHaveBeenCalledWith({ types: ["Configured"] });
  });

  it("clears the filter via the Clear item", async () => {
    const user = userEvent.setup();
    const setFilterValue = vi.fn();
    render(
      <DataTableFacetedFilter
        title="Status"
        options={options}
        column={makeColumn({ types: ["Connected"] }, setFilterValue)}
      />,
    );
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Clear"));
    expect(setFilterValue).toHaveBeenCalledWith(undefined);
  });
});
