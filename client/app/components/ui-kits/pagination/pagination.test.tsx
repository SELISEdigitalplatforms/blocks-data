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
  const onChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const props = {
    page: 0,
    pageSize: 10,
    totalCount: 50,
    pageSizeOptions: [5, 10, 20],
    onChange,
    onPageSizeChange,
    ...overrides,
  };
  const view = render(<Pagination {...props} />);
  return { ...view, onChange, onPageSizeChange };
}

describe("Pagination", () => {
  it("shows the current page position", () => {
    setup({ page: 1, totalCount: 50 });
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("hides itself when every row fits on the first page", () => {
    const { container } = setup({ totalCount: 1 });
    expect(container).toBeEmptyDOMElement();
  });

  it("stays visible on a later page and never reports zero pages", () => {
    setup({ page: 1, totalCount: 0 });
    expect(screen.getByText("Page 2 of 1")).toBeInTheDocument();
  });

  it("offers only the page sizes the row count needs", async () => {
    const user = userEvent.setup();
    setup({ totalCount: 7 });
    await user.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["5", "10"]);
  });

  it("drops the page size selector when only one size is given", () => {
    setup({ pageSizeOptions: [10], totalCount: 50 });
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  it("navigates between pages", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ page: 1, totalCount: 50 });
    const [first, previous, next, last] = screen.getAllByRole("button").slice(-4);
    await user.click(first);
    await user.click(previous);
    await user.click(next);
    await user.click(last);
    expect(onChange.mock.calls.map(([page]) => page)).toEqual([0, 0, 2, 4]);
  });
});
