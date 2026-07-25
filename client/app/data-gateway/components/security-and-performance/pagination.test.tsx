import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Capture the props forwarded to the shared Pagination primitive.
const sharedProps = vi.fn();
vi.mock("@/data-gateway/components/shared/pagination", () => ({
  Pagination: (props: Record<string, unknown>) => {
    sharedProps(props);
    return <div data-testid="shared-pagination" />;
  },
}));

import SecurityAndPerformancePagination, {
  PAGE_SIZE_OPTIONS,
} from "./pagination";

describe("SecurityAndPerformancePagination", () => {
  it("forwards its props to the shared Pagination primitive", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <SecurityAndPerformancePagination
        pageNo={2}
        totalPages={5}
        pageSize={50}
        isLoading={false}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByTestId("shared-pagination")).toBeInTheDocument();
    expect(sharedProps).toHaveBeenCalledWith(
      expect.objectContaining({
        pageNo: 2,
        totalPages: 5,
        pageSize: 50,
        isLoading: false,
        onPageChange,
        onPageSizeChange,
        className: "",
      }),
    );
  });

  it("re-exports the page size options", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 50, 100, 200]);
  });
});
