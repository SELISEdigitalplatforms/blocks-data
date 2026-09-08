import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

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
  statusDescription: "",
  schemaName: "getBlxDrives",
  entityName: "BlxDrive",
  collectionName: "",
  operationType: "query",
  operationQuery: "query GetBlxDrives($userId: String!) { getBlxDrives { items { ItemId } } }",
  mongoQuery: '{ "UserId": "u1" }',
  responseStatus: "failed",
  failureKind: "authentication",
  failureCode: "AUTH_NOT_AUTHENTICATED",
  failureMessage: "User is not authenticated.",
  statusCode: 401,
  requestSize: 615,
  responseSize: 189,
  databaseResponseSize: 0,
  documentCount: 10,
  inAppRequest: true,
  isIntrospection: false,
  userAgent: "Mozilla/5.0 (Macintosh) Chrome/151",
  policyMs: 12.5,
  validationMs: 0,
  databaseMs: 940.2,
  publishMs: 0,
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

// Radix Select needs these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

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
    expect(screen.getByText("denied")).toBeInTheDocument();
    // The reason is a detail-panel question; a second line per row made the table hard to scan.
    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(screen.getByText("In-app")).toBeInTheDocument();
    expect(screen.getByText("1 request")).toBeInTheDocument();
  });

  it("shows a syntax failure as an error rather than a denial", () => {
    mockResult([{ ...ITEM, failureKind: "syntax_error", failureCode: "HC0017", statusCode: 400 }]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.queryByText("denied")).not.toBeInTheDocument();
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
      outcome: undefined,
      statusCode: undefined,
      failureKind: undefined,
      sortBy: "time",
      sortDescending: true,
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
    expect(within(details).getByText("10")).toBeInTheDocument();
    expect(within(details).getByText(/Chrome\/151/)).toBeInTheDocument();
    // The total is only useful next to where it went, so the request carries the same phase
    // breakdown the Performance tab shows for the range.
    expect(within(details).getByText("Where the time went")).toBeInTheDocument();
    expect(within(details).getByText("Database")).toBeInTheDocument();
    expect(within(details).getByText("940 ms")).toBeInTheDocument();
    expect(within(details).getByText("63%")).toBeInTheDocument();
    // 1490 total − 940 db − 13 policy leaves the gateway and the wire.
    expect(within(details).getByText("Gateway & transport")).toBeInTheDocument();
    expect(within(details).getByText("538 ms")).toBeInTheDocument();
    expect(within(details).getByText("Authentication")).toBeInTheDocument();
    expect(within(details).getByText("AUTH_NOT_AUTHENTICATED")).toBeInTheDocument();
    expect(within(details).getByText("User is not authenticated.")).toBeInTheDocument();
    expect(within(details).getByText(/query GetBlxDrives/)).toBeInTheDocument();
    expect(within(details).getByText(/"UserId": "u1"/)).toBeInTheDocument();
  });

  it("filters by failure reason", async () => {
    const user = userEvent.setup();
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByRole("combobox", { name: "Failure reason" }));
    await user.click(await screen.findByRole("option", { name: "Syntax error" }));

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureKind: "syntax_error", pageNo: 1 }),
    );
  });

  it("filters by allowed, denied, or error outcome", async () => {
    const user = userEvent.setup();
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByRole("combobox", { name: "Response status" }));
    await user.click(await screen.findByRole("option", { name: "Denied" }));

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "denied", pageNo: 1 }),
    );
  });

  it("filters by HTTP status code", async () => {
    const user = userEvent.setup();
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByRole("combobox", { name: "Status code" }));
    await user.click(await screen.findByRole("option", { name: "401" }));

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ statusCode: 401, pageNo: 1 }),
    );
  });

  it("sorts by a column and toggles its direction", async () => {
    const user = userEvent.setup();
    mockResult([ITEM]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    await user.click(screen.getByRole("button", { name: "Sort by Schema" }));
    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: "schema", sortDescending: false, pageNo: 1 }),
    );

    await user.click(screen.getByRole("button", { name: "Sort by Schema" }));
    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: "schema", sortDescending: true, pageNo: 1 }),
    );
  });

  it("names introspection rows, which carry no schema of their own", () => {
    mockResult([{ ...ITEM, schemaName: "", isIntrospection: true, responseStatus: "success" }]);
    render(<GraphLogHistory from="2026-08-24" to="2026-08-31" />);

    expect(screen.getByText("introspection")).toBeInTheDocument();
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

    expect(useGraphLogHistoryMock).toHaveBeenLastCalledWith(expect.objectContaining({ pageNo: 2 }));
  });
});
