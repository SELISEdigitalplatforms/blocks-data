import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let hookState: {
  initialLogs: unknown[];
  isLoading: boolean;
  hasTopMore: boolean;
  fetchOldLogs: ReturnType<typeof vi.fn>;
  fetchNewLogs: ReturnType<typeof vi.fn>;
};

vi.mock("../logs-header/logs-filter-toolbar", () => ({
  LogsFilterToolbar: () => <div>filter-toolbar</div>,
}));
vi.mock("./log-item", () => ({
  LogItem: ({ log }: { log: { message: string } }) => <span>{log.message}</span>,
}));
vi.mock("@/components/infinite-scroller", () => ({
  InfiniteScroll: ({
    initialData,
    renderItem,
  }: {
    initialData: { message: string }[];
    renderItem: (log: { message: string }, index: number) => ReactNode;
  }) => <div data-testid="scroll">{initialData.map((l, i) => renderItem(l, i))}</div>,
}));
vi.mock("../../hooks/use-service-logs", () => ({
  useServiceLogs: () => hookState,
}));

import { LogsList } from "./logs-list";
import { LogsViewerContext } from "../logs-viewer";

const renderWithContext = (ctx: Partial<React.ContextType<typeof LogsViewerContext>> = {}) =>
  render(
    <LogsViewerContext.Provider
      value={
        {
          selectedService: { serviceName: "svc" },
          filter: { level: "", startDate: "", endDate: "", search: "" },
          pageSize: 20,
          ...ctx,
        } as never
      }
    >
      <LogsList />
    </LogsViewerContext.Provider>,
  );

beforeEach(() => {
  hookState = {
    initialLogs: [],
    isLoading: false,
    hasTopMore: false,
    fetchOldLogs: vi.fn().mockResolvedValue([]),
    fetchNewLogs: vi.fn().mockResolvedValue([]),
  };
});

describe("LogsList", () => {
  it("always renders the filter toolbar", () => {
    renderWithContext();
    expect(screen.getByText("filter-toolbar")).toBeInTheDocument();
  });

  it("renders skeletons while loading", () => {
    hookState.isLoading = true;
    const { container } = renderWithContext();
    expect(container.querySelectorAll(".rounded-lg").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("scroll")).not.toBeInTheDocument();
  });

  it("renders the log items once loaded", () => {
    hookState.initialLogs = [
      { traceId: "t1", timestamp: "2024-01-01", message: "hello" },
      { traceId: "t2", timestamp: "2024-01-02", message: "world" },
    ];
    renderWithContext();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });
});
