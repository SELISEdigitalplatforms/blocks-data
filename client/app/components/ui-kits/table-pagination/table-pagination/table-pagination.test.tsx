import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Table } from "@tanstack/react-table";
import { TablePagination } from "./table-pagination";

type Overrides = {
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  filteredRows?: number;
  selectedRows?: number;
  canPrev?: boolean;
  canNext?: boolean;
};

function makeTable(o: Overrides = {}) {
  const {
    pageIndex = 0,
    pageSize = 10,
    pageCount = 3,
    filteredRows = 25,
    selectedRows = 2,
    canPrev = false,
    canNext = true,
  } = o;
  return {
    getFilteredRowModel: () => ({ rows: new Array(filteredRows).fill(0) }),
    getFilteredSelectedRowModel: () => ({ rows: new Array(selectedRows).fill(0) }),
    getState: () => ({ pagination: { pageIndex, pageSize } }),
    getPageCount: () => pageCount,
    getCanPreviousPage: () => canPrev,
    getCanNextPage: () => canNext,
    setPageIndex: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    setPageSize: vi.fn(),
  } as unknown as Table<unknown>;
}

afterEach(() => vi.clearAllMocks());

describe("TablePagination", () => {
  it("shows total-count summary when totalCount is provided", () => {
    render(<TablePagination table={makeTable()} totalCount={25} />);
    expect(screen.getByText(/Total 25 items/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("singularizes the total-count summary for a single item", () => {
    render(<TablePagination table={makeTable()} totalCount={1} />);
    expect(screen.getByText(/Total 1 item/)).toBeInTheDocument();
  });

  it("shows the selected-rows summary when totalCount is absent", () => {
    render(<TablePagination table={makeTable({ selectedRows: 2, filteredRows: 25 })} />);
    expect(screen.getByText(/2 of 25 row\(s\) selected/)).toBeInTheDocument();
  });

  it("navigates via the next / last buttons and reports the page via onPageChange", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const table = makeTable({ canPrev: true, canNext: true, pageIndex: 1 });
    render(<TablePagination table={table} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole("button");
    // Order: first, prev, next, last.
    await user.click(buttons[2]);
    expect(table.nextPage).toHaveBeenCalled();
    await user.click(buttons[3]);
    expect(table.setPageIndex).toHaveBeenCalledWith(2);
    await user.click(buttons[0]);
    expect(table.setPageIndex).toHaveBeenCalledWith(0);
    await user.click(buttons[1]);
    expect(table.previousPage).toHaveBeenCalled();
    expect(onPageChange).toHaveBeenCalled();
  });

  it("disables previous-page buttons on the first page", () => {
    render(<TablePagination table={makeTable({ canPrev: false, canNext: true })} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeEnabled();
  });
});
