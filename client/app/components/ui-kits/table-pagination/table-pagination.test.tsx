import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TablePagination } from "./table-pagination";

type Overrides = {
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  canPrev?: boolean;
  canNext?: boolean;
  rows?: number;
  selectedRows?: number;
};

const makeTable = (o: Overrides = {}) => {
  const rows = Array.from({ length: o.rows ?? 25 });
  const selected = Array.from({ length: o.selectedRows ?? 0 });
  return {
    getFilteredRowModel: () => ({ rows }),
    getFilteredSelectedRowModel: () => ({ rows: selected }),
    getState: () => ({ pagination: { pageSize: o.pageSize ?? 10, pageIndex: o.pageIndex ?? 0 } }),
    getPageCount: () => o.pageCount ?? 3,
    getCanPreviousPage: () => o.canPrev ?? true,
    getCanNextPage: () => o.canNext ?? true,
    setPageIndex: vi.fn(),
    setPageSize: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
  };
};

afterEach(() => vi.clearAllMocks());

describe("TablePagination", () => {
  it("shows the selected-of-total text when no totalCount is given", () => {
    render(<TablePagination table={makeTable({ rows: 12, selectedRows: 3 }) as never} />);
    expect(screen.getByText(/3 of 12 row\(s\) selected/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("shows the totalCount summary when provided (plural)", () => {
    render(<TablePagination table={makeTable() as never} totalCount={5} />);
    expect(screen.getByText(/Total 5 items/)).toBeInTheDocument();
  });

  it("shows the singular item label for a total of one", () => {
    render(<TablePagination table={makeTable() as never} totalCount={1} />);
    expect(screen.getByText(/Total 1 item/)).toBeInTheDocument();
  });

  it("navigates to the next and last pages", async () => {
    const user = userEvent.setup();
    const table = makeTable();
    const onPageChange = vi.fn();
    render(<TablePagination table={table as never} onPageChange={onPageChange} />);
    const buttons = screen.getAllByRole("button");
    // Last two buttons are next and last.
    await user.click(buttons[buttons.length - 2]);
    expect(table.nextPage).toHaveBeenCalled();
    await user.click(buttons[buttons.length - 1]);
    expect(table.setPageIndex).toHaveBeenCalledWith(2);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("navigates to the first and previous pages", async () => {
    const user = userEvent.setup();
    const table = makeTable({ pageIndex: 2 });
    render(<TablePagination table={table as never} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 4]);
    expect(table.setPageIndex).toHaveBeenCalledWith(0);
    await user.click(buttons[buttons.length - 3]);
    expect(table.previousPage).toHaveBeenCalled();
  });

  it("disables navigation buttons when paging is not possible", () => {
    render(<TablePagination table={makeTable({ canPrev: false, canNext: false }) as never} />);
    const buttons = screen.getAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled);
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });
});
