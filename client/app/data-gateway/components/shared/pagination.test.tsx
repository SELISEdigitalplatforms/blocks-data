import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

function setup(overrides = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const props = {
    pageNo: 2,
    pageSize: 10,
    totalPages: 5,
    totalCount: 50,
    isLoading: false,
    onPageChange,
    onPageSizeChange,
    ...overrides,
  };
  render(<Pagination {...props} />);
  return { onPageChange, onPageSizeChange };
}

describe("Pagination", () => {
  it("shows the current page position", () => {
    setup({ pageNo: 2, totalPages: 5 });
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("navigates to first/previous/next/last pages", async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ pageNo: 2, totalPages: 5 });

    await user.click(screen.getByTitle("First page"));
    await user.click(screen.getByTitle("Previous page"));
    await user.click(screen.getByTitle("Next page"));
    await user.click(screen.getByTitle("Last page"));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1); // pageNo - 1
    expect(onPageChange).toHaveBeenNthCalledWith(3, 3); // pageNo + 1
    expect(onPageChange).toHaveBeenNthCalledWith(4, 5); // totalPages
  });

  it("disables first/previous on the first page", () => {
    setup({ pageNo: 1, totalPages: 5 });
    expect(screen.getByTitle("First page")).toBeDisabled();
    expect(screen.getByTitle("Previous page")).toBeDisabled();
    expect(screen.getByTitle("Next page")).toBeEnabled();
  });

  it("disables next/last on the last page", () => {
    setup({ pageNo: 5, totalPages: 5 });
    expect(screen.getByTitle("Next page")).toBeDisabled();
    expect(screen.getByTitle("Last page")).toBeDisabled();
    expect(screen.getByTitle("Previous page")).toBeEnabled();
  });

  it("disables all navigation while loading", () => {
    setup({ pageNo: 3, totalPages: 5, isLoading: true });
    expect(screen.getByTitle("First page")).toBeDisabled();
    expect(screen.getByTitle("Previous page")).toBeDisabled();
    expect(screen.getByTitle("Next page")).toBeDisabled();
    expect(screen.getByTitle("Last page")).toBeDisabled();
  });

  it("hides itself when every row fits on the first page", () => {
    const { container } = render(
      <Pagination
        pageNo={1}
        pageSize={10}
        totalPages={1}
        totalCount={1}
        isLoading={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stays visible on a later page even when the rows now fit on one", () => {
    setup({ pageNo: 2, totalPages: 1, totalCount: 3 });
    expect(screen.getByText("Page 2 of 1")).toBeInTheDocument();
  });

  it("never reports zero pages", () => {
    setup({ pageNo: 2, totalPages: 0, totalCount: 0 });
    expect(screen.getByText("Page 2 of 1")).toBeInTheDocument();
  });

  it("offers only the page sizes the row count needs", async () => {
    const user = userEvent.setup();
    setup({ pageNo: 1, totalPages: 3, totalCount: 30 });
    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["10", "50"]);
  });

  it("drops the page size selector when only one size is useful", () => {
    setup({ pageNo: 2, totalPages: 2, totalCount: 5 });
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});
