import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

import { IGraphLogAnalyticsData } from "../../models/graph-log-analytics";

// Radix Select needs these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const useGraphLogAnalyticsMock = vi.fn();

vi.mock("../../hooks/use-graph-log-analytics", () => ({
  useGraphLogAnalytics: (...args: unknown[]) => useGraphLogAnalyticsMock(...args),
}));

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: () => <nav data-testid="breadcrumb" />,
}));

vi.mock("../../components/data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));

vi.mock("./graph-log-history", () => ({
  GraphLogHistory: (props: { from?: string; to?: string }) => (
    <div data-testid="history">{`${props.from}..${props.to}`}</div>
  ),
}));

import { GraphAnalytics } from "./graph-analytics-page";

const ANALYTICS: IGraphLogAnalyticsData = {
  requestsOverTime: [
    { date: "2026-08-30T00:00:00Z", success: 6, failed: 4, denied: 3, errored: 1 },
    { date: "2026-08-31T00:00:00Z", success: 0, failed: 0, denied: 0, errored: 0 },
  ],
  operationStats: [
    {
      schemaName: "getBlxDrives",
      calls: 10,
      success: 6,
      failed: 4,
      denied: 3,
      errored: 1,
      errorRate: 40,
      averageDuration: 780.2,
      p95Duration: 1540.5,
      averageResponseSize: 2048,
      maxResponseSize: 8192,
      totalBytes: 26624,
      averageDocumentCount: 250,
      maxDocumentCount: 500,
    },
  ],
  failureStats: [
    { failureKind: "authorization", count: 2 },
    { failureKind: "validation", count: 1 },
    { failureKind: "unhandled", count: 1 },
  ],
  failureHotspots: [
    { schemaName: "getBlxDrives", failureKind: "authorization", count: 2, externalCount: 1 },
  ],
  latency: { p50: 420, p95: 1540.5, p99: 2000, max: 2311.9, average: 780.2 },
  latencyOverTime: [{ date: "2026-08-30T00:00:00Z", p50: 420, p95: 1540.5, p99: 2000 }],
  throughput: { requestBytes: 6150, responseBytes: 20474, totalBytes: 26624 },
  throughputOverTime: [
    { date: "2026-08-30T00:00:00Z", requestBytes: 6150, responseBytes: 20474 },
    { date: "2026-08-31T00:00:00Z", requestBytes: 0, responseBytes: 0 },
  ],
  timing: {
    averageTotal: 1000,
    averagePolicy: 200,
    averageValidation: 50,
    averageDatabase: 600,
    averagePublish: 0,
    averageOther: 150,
  },
  schemaCoverage: [
    { entityName: "BlxDrive", calls: 10, queries: 9, mutations: 1 },
    { entityName: "Invoice", calls: 0, queries: 0, mutations: 0 },
    { entityName: "Wearhouse", calls: 0, queries: 0, mutations: 0 },
  ],
};

const openTab = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole("tab", { name }));

describe("GraphAnalytics", () => {
  beforeEach(() => {
    useGraphLogAnalyticsMock.mockReset();
    useGraphLogAnalyticsMock.mockReturnValue({
      data: { isSuccess: true, data: ANALYTICS, errors: null },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it("opens on traffic and keeps the other views one click away", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    const card = (name: string) => screen.getByRole("heading", { name });

    expect(card("Requests over time")).toBeInTheDocument();
    expect(card("Most frequent operations")).toBeInTheDocument();
    expect(card("Schema coverage")).toBeInTheDocument();
    // Other tabs' content is not mounted until asked for.
    expect(screen.queryByRole("heading", { name: "Response time" })).not.toBeInTheDocument();

    await openTab(user, "Performance");
    expect(await screen.findByRole("heading", { name: "Response time" })).toBeInTheDocument();
    expect(card("Where the time goes")).toBeInTheDocument();
    expect(card("Data transfer")).toBeInTheDocument();

    await openTab(user, "Reliability");
    expect(await screen.findByRole("heading", { name: "Failures by reason" })).toBeInTheDocument();
    expect(card("Error rates")).toBeInTheDocument();

    await openTab(user, "Requests");
    expect(await screen.findByTestId("history")).toHaveTextContent(/^\d{4}-\d{2}-\d{2}\.\./);
  });

  it("fetches once for the whole page, from the shared range and bucket size", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    const [from, to, granularity] = useGraphLogAnalyticsMock.mock.calls.at(-1)!;
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(granularity).toBe("daily");

    await user.click(screen.getByRole("combobox", { name: "Bucket size" }));
    await user.click(await screen.findByRole("option", { name: "Hourly" }));

    expect(useGraphLogAnalyticsMock).toHaveBeenLastCalledWith(from, to, "hourly");
  });

  it("says the analytics exclude introspection, but not on the log tab", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    const note = /Schema introspection requests are excluded/;
    expect(screen.getByText(note)).toBeInTheDocument();

    await openTab(user, "Requests");
    // The log does show them, so the caveat would be wrong there.
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it("keeps the date range on every tab", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    for (const tab of ["Performance", "Reliability", "Requests"]) {
      await openTab(user, tab);
      expect(screen.getByRole("button", { name: /Date range/ })).toBeInTheDocument();
    }
  });

  it("offers a bucket size only where something is bucketed over time", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    const bucketSize = () => screen.queryByRole("combobox", { name: "Bucket size" });

    for (const tab of ["Traffic", "Performance", "Reliability"]) {
      await openTab(user, tab);
      expect(bucketSize()).toBeInTheDocument();
    }

    // The request log has no time series, so the control would do nothing there.
    for (const tab of ["Requests"]) {
      await openTab(user, tab);
      expect(bucketSize()).not.toBeInTheDocument();
    }
  });

  it("surfaces the numbers each tab exists for", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    await openTab(user, "Reliability");
    expect(screen.getAllByText("Authorization")).toHaveLength(2);

    await openTab(user, "Performance");
    expect(screen.getByText("420 ms")).toBeInTheDocument();
    // 600 of 1000ms in Mongo — the phase the reader is looking for.
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("600 ms")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("6.0 KB in · 20.0 KB out")).toBeInTheDocument();

    await openTab(user, "Traffic");
    expect(screen.getByText("2 of 3 never called in this range")).toBeInTheDocument();
    expect(screen.getAllByText("unused")).toHaveLength(2);

    // The operations row splits its failures the same way the outcome tiles do.
    const operationRow = screen
      .getAllByRole("row")
      .find((row) => row.textContent?.startsWith("getBlxDrives"))!;
    expect(within(operationRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "getBlxDrives",
      "10",
      "6",
      "3",
      "1",
      "780 ms",
      "1.54 s",
    ]);
  });

  it("separates requests the gateway refused from requests that broke", () => {
    render(<GraphAnalytics />);

    // Traffic opens on this card: volume and its composition are the same question.
    const card = screen.getByRole("heading", { name: "Requests over time" }).closest("div")!
      .parentElement!;

    // 10 requests: 3 refused on purpose (2 by policy, 1 by validation) and 1 that broke,
    // leaving 6 served. Validation counts as a denial — rejecting bad input is the gateway
    // working, not failing.
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).getByText("Allows · 60%")).toBeInTheDocument();
    expect(within(card).getByText("Denies · 30%")).toBeInTheDocument();
    expect(within(card).getByText("2 authorization · 1 validation")).toBeInTheDocument();
    expect(within(card).getByText("Errors · 10%")).toBeInTheDocument();
    expect(within(card).getByText("1 server error")).toBeInTheDocument();

    // The same three outcomes, over time, in one chart rather than a separate error-rate line.
    expect(
      within(card).getByRole("img", { name: "Allowed, denied and errored requests over time" }),
    ).toBeInTheDocument();
  });
});
