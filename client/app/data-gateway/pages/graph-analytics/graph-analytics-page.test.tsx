import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: () => <nav data-testid="breadcrumb" />,
}));

vi.mock("../../components/data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));

const overviewProps = vi.fn();
const historyProps = vi.fn();

vi.mock("./graph-analytics-overview", () => ({
  GraphAnalyticsOverview: (props: { from?: string; to?: string }) => {
    overviewProps(props);
    return <div data-testid="overview" />;
  },
}));

vi.mock("./graph-log-history", () => ({
  GraphLogHistory: (props: { from?: string; to?: string }) => {
    historyProps(props);
    return <div data-testid="history" />;
  },
}));

import { GraphAnalytics } from "./graph-analytics-page";

describe("GraphAnalytics", () => {
  it("shows the overview tab first and switches to log history on demand", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    expect(screen.getByTestId("overview")).toBeInTheDocument();
    expect(screen.queryByTestId("history")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Log history" }));

    expect(await screen.findByTestId("history")).toBeInTheDocument();
  });

  it("drives both tabs from the same date range", async () => {
    const user = userEvent.setup();
    render(<GraphAnalytics />);

    const { from, to } = overviewProps.mock.calls.at(-1)![0];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.click(screen.getByRole("tab", { name: "Log history" }));

    expect(historyProps.mock.calls.at(-1)![0]).toEqual({ from, to });
  });
});
