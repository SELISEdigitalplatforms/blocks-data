import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

function setup(overrides = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const props = {
    pageNo: 2,
    pageSize: 10,
    totalPages: 5,
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
});
