import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { MemoryRouter, useLocation } from "react-router";

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

const LocationSearch = () => {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
};

const renderAnalytics = (initialEntry = "/services/data-gateway/analytics") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <GraphAnalytics />
      <LocationSearch />
    </MemoryRouter>,
  );

const ANALYTICS: IGraphLogAnalyticsData = {
  requestsOverTime: [
    { date: "2026-08-30T00:00:00Z", success: 6, denied: 3, errored: 1 },
    { date: "2026-08-31T00:00:00Z", success: 0, denied: 0, errored: 0 },
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
  latency: { p50: 420, p95: 1540.5, p99: 2000, max: 2311.9 },
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
    renderAnalytics();

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
    renderAnalytics();

    const [from, to, granularity, utcOffsetMinutes] = useGraphLogAnalyticsMock.mock.calls.at(-1)!;
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(granularity).toBe("daily");
    expect(utcOffsetMinutes).toEqual(expect.any(Number));

    await user.click(screen.getByRole("combobox", { name: "Bucket size" }));
    await user.click(await screen.findByRole("option", { name: "Hourly" }));

    expect(useGraphLogAnalyticsMock).toHaveBeenLastCalledWith(from, to, "hourly", utcOffsetMinutes);
  });

  it("says the analytics exclude introspection, but not on the log tab", async () => {
    const user = userEvent.setup();
    renderAnalytics();

    const note = /Schema introspection requests are excluded/;
    expect(screen.getByText(note)).toBeInTheDocument();

    await openTab(user, "Requests");
    // The log does show them, so the caveat would be wrong there.
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it("keeps the date range on every tab", async () => {
    const user = userEvent.setup();
    renderAnalytics();

    for (const tab of ["Performance", "Reliability", "Requests"]) {
      await openTab(user, tab);
      expect(screen.getByRole("button", { name: /Date range/ })).toBeInTheDocument();
    }
  });

  it("offers a bucket size only where something is bucketed over time", async () => {
    const user = userEvent.setup();
    renderAnalytics();

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
    renderAnalytics();

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
    expect(
      within(operationRow)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["getBlxDrives", "10", "6", "3", "1", "780 ms", "1.54 s"]);
  });

  it("separates requests the gateway refused from requests that broke", () => {
    renderAnalytics();

    // Traffic opens on this card: volume and its composition are the same question.
    const card = screen
      .getByRole("heading", { name: "Requests over time" })
      .closest("div")!.parentElement!;

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

  it("counts syntax failures as errors and labels unknown reasons as others", () => {
    useGraphLogAnalyticsMock.mockReturnValue({
      data: {
        isSuccess: true,
        data: {
          ...ANALYTICS,
          requestsOverTime: [{ date: "2026-08-30T00:00:00Z", success: 0, denied: 0, errored: 2 }],
          failureStats: [
            { failureKind: "syntax_error", count: 1 },
            { failureKind: "unknown", count: 1 },
          ],
        },
        errors: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderAnalytics();

    const card = screen
      .getByRole("heading", { name: "Requests over time" })
      .closest("div")!.parentElement!;
    expect(within(card).getByText("Denies · 0%")).toBeInTheDocument();
    expect(within(card).getByText("Errors · 100%")).toBeInTheDocument();
    expect(within(card).getByText("1 syntax error · 1 others")).toBeInTheDocument();
  });

  it("keeps rare denied and error outcomes visible beside high successful traffic", () => {
    useGraphLogAnalyticsMock.mockReturnValue({
      data: {
        isSuccess: true,
        data: {
          ...ANALYTICS,
          requestsOverTime: [{ date: "2026-09-10T00:00:00Z", success: 990, denied: 1, errored: 3 }],
          failureStats: [
            { failureKind: "validation", count: 1 },
            { failureKind: "bad_request", count: 3 },
          ],
        },
        errors: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderAnalytics();

    const card = screen
      .getByRole("heading", { name: "Requests over time" })
      .closest("div")!.parentElement!;
    expect(within(card).getByText("Allows · 99.6%")).toBeInTheDocument();
    expect(within(card).getByText("Denies · 0.1%")).toBeInTheDocument();
    expect(within(card).getByText("Errors · 0.3%")).toBeInTheDocument();
  });

  it("restores the active tab from the URL and persists tab changes", async () => {
    const user = userEvent.setup();
    renderAnalytics("/services/data-gateway/analytics?source=alert&tab=performance");

    expect(await screen.findByRole("heading", { name: "Response time" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Performance" })).toHaveAttribute(
      "data-state",
      "active",
    );

    await openTab(user, "Requests");

    expect(await screen.findByTestId("history")).toBeInTheDocument();
    expect(screen.getByTestId("location-search")).toHaveTextContent("?source=alert&tab=requests");
  });

  it("replaces a missing or invalid tab with the traffic URL", async () => {
    renderAnalytics("/services/data-gateway/analytics?tab=removed-view");

    expect(await screen.findByTestId("location-search")).toHaveTextContent("?tab=traffic");
    expect(screen.getByRole("tab", { name: "Traffic" })).toHaveAttribute("data-state", "active");
  });
});
