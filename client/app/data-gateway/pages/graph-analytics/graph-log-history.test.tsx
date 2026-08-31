import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { IGraphLogHistoryItem } from "../../models/graph-log-history";

const useGraphLogHistoryMock = vi.fn();

vi.mock("../../hooks/use-graph-log-history", () => ({
  useGraphLogHistory: (payload: unknown) => useGraphLogHistoryMock(payload),
}));

import { GraphLogHistory } from "./graph-log-history";

const ITEM: IGraphLogHistoryItem = {
  traceId: "740beaf14c3d3b81aef579129094f667",
  spanId: "d8793a20abbf427c",
  timestamp: "2026-08-30T19:09:57.099Z",
  startTime: "2026-08-30T19:09:55.608Z",
  endTime: "2026-08-30T19:09:57.099Z",
  duration: 1490.289,
  operationName: "POST /api/gateway",
  status: "Unset",
  statusDescription: "",
  schemaName: "getBlxDrives",
  entityName: "BlxDrive",
  collectionName: "",
  operationType: "query",
  operationQuery: "query GetBlxDrives($userId: String!) { getBlxDrives { items { ItemId } } }",
  mongoQuery: '{ "UserId": "u1" }',
  responseStatus: "failed",
  statusCode: 401,
  requestSize: 615,
  responseSize: 189,
  databaseResponseSize: 0,
  inAppRequest: true,
};

function mockResult(items: IGraphLogHistoryItem[], totalCount = items.length) {
  useGraphLogHistoryMock.mockReturnValue({
    data: { isSuccess: true, data: { totalCount, items }, errors: null },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });
}

describe("GraphLogHistory", () => {
  beforeEach(() => {
    useGraphLogHistoryMock.mockReset();
  });

  it("lists each request with its schema, duration and status", () => {
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    expect(screen.getByText("getBlxDrives")).toBeInTheDocument();
    // Rendered in the runner's timezone, so assert the shape rather than a fixed clock time.
    expect(screen.getByText(/^\d{1,2} Aug 2026, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText("1.49 s")).toBeInTheDocument();
    expect(screen.getByText("401")).toBeInTheDocument();
    expect(screen.getByText("189 B")).toBeInTheDocument();
    // Request size lives in the details panel only.
    expect(screen.queryByText("615 B")).not.toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("In-app")).toBeInTheDocument();
    expect(screen.getByText("1 request")).toBeInTheDocument();
  });

  it("passes the range and paging through to the query", () => {
    mockResult([ITEM], 25);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith({
      from: "2026-08-24",
      to: "2026-08-31",
      pageNo: 1,
      pageSize: 10,
      operationType: undefined,
      responseStatus: undefined,
    });
  });

  it("opens the details panel with the full request when a row is clicked", async () => {
    const user = userEvent.setup();
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByText("getBlxDrives"));

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("POST /api/gateway")).toBeInTheDocument();
    expect(within(details).getByText(ITEM.traceId)).toBeInTheDocument();
    expect(within(details).getByText("615 B")).toBeInTheDocument();
    expect(within(details).getByText(/query GetBlxDrives/)).toBeInTheDocument();
    expect(within(details).getByText(/"UserId": "u1"/)).toBeInTheDocument();
  });

  it("shows an empty state when the range has no requests", () => {
    mockResult([]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    expect(screen.getByText("No requests in this range.")).toBeInTheDocument();
  });

  it("requests the next page when paging forward", async () => {
    const user = userEvent.setup();
    mockResult([ITEM], 25);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByTitle("Next page"));

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 2 }),
    );
  });
});
