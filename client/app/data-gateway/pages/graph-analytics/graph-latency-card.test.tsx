import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GraphLatencyCard } from "./graph-latency-card";

const LATENCY = { p50: 420, p95: 1540.5, p99: 2000, max: 2311.9 };
const OVER_TIME = [
  { date: "2026-08-30T00:00:00Z", p50: 400, p95: 1500, p99: 1900 },
  { date: "2026-08-31T00:00:00Z", p50: 440, p95: 1580, p99: 2000 },
];

describe("GraphLatencyCard", () => {
  it("leads with the percentiles a caller actually feels", () => {
    render(
      <GraphLatencyCard
        latency={LATENCY}
        latencyOverTime={OVER_TIME}
        granularity="daily"
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByText("Response time")).toBeInTheDocument();
    expect(screen.getByText("420 ms")).toBeInTheDocument();
    expect(screen.getByText("1.54 s")).toBeInTheDocument();
    expect(screen.getByText("2.00 s")).toBeInTheDocument();
    expect(screen.getByText("2.31 s")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Response time percentiles over time" }),
    ).toBeInTheDocument();
  });

  it("explains every percentile with an example", async () => {
    const user = userEvent.setup();
    render(
      <GraphLatencyCard
        latency={LATENCY}
        latencyOverTime={OVER_TIME}
        granularity="daily"
        isLoading={false}
        isError={false}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Explain response time percentiles" }));

    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("P50:");
      expect(tooltip).toHaveTextContent("50 of 100 requests");
      expect(tooltip).toHaveTextContent("P95:");
      expect(tooltip).toHaveTextContent("95 of 100 requests");
      expect(tooltip).toHaveTextContent("P99:");
      expect(tooltip).toHaveTextContent("99 of 100 requests");
    });
  });

  it("says so rather than drawing a flat line at zero when nothing was recorded", () => {
    render(
      <GraphLatencyCard
        latency={{ p50: 0, p95: 0, p99: 0, max: 0 }}
        latencyOverTime={[{ date: "2026-08-31T00:00:00Z", p50: 0, p95: 0, p99: 0 }]}
        granularity="daily"
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByText("No requests in this range.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("reports a failed load instead of an empty plot", () => {
    render(<GraphLatencyCard granularity="daily" isLoading={false} isError />);

    expect(screen.getByText(/Couldn't load response times/)).toBeInTheDocument();
  });
});
