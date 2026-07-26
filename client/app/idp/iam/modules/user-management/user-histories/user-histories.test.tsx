import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let histories: { data: unknown[]; totalCount: number } | undefined;
vi.mock("@blocks-idp/iam/hooks/use-activity", () => ({
  useGetHistories: () => ({ isLoading: false, isFetching: false, data: histories }),
}));
vi.mock("./user-history-list", () => ({
  UserHistoryList: () => <div data-testid="history-list" />,
}));
vi.mock("@/components/ui-kits/pagination/pagination", () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

import { UserHistories } from "./user-histories";

afterEach(() => vi.clearAllMocks());

describe("UserHistories", () => {
  it("renders the history list without pagination for a single page", () => {
    histories = { data: [{ id: "h1" }], totalCount: 5 };
    render(<UserHistories id="u1" projectKey="t1" />);
    expect(screen.getByTestId("history-list")).toBeInTheDocument();
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  it("shows pagination when the total count exceeds the page size", () => {
    histories = { data: [{ id: "h1" }], totalCount: 25 };
    render(<UserHistories id="u1" projectKey="t1" />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });
});
