import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const logsViewerProps = vi.fn();

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: ({ breadcrumbIndex }: { breadcrumbIndex: number }) => (
    <nav data-testid="breadcrumb">index:{breadcrumbIndex}</nav>
  ),
}));

vi.mock("@/service-logs", () => ({
  LogsViewer: (props: {
    services: Array<{ label: string }>;
    predefinedQueries: string[];
  }) => {
    logsViewerProps(props);
    return (
      <div data-testid="logs-viewer">
        {props.services.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
    );
  },
}));

import { DataServiceLogs } from "./data-service-logs";

describe("DataServiceLogs", () => {
  it("renders the breadcrumb and logs viewer", () => {
    render(<DataServiceLogs />);
    expect(screen.getByTestId("breadcrumb")).toHaveTextContent("index:3");
    expect(screen.getByTestId("logs-viewer")).toBeInTheDocument();
  });

  it("passes the Api and Worker services plus predefined queries", () => {
    render(<DataServiceLogs />);
    expect(screen.getByText("Api")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();

    const props = logsViewerProps.mock.calls.at(-1)![0];
    expect(props.services.map((s: { serviceName: string }) => s.serviceName)).toEqual([
      "blocks-data",
      "blocks-data-worker",
    ]);
    expect(props.predefinedQueries.length).toBeGreaterThan(0);
  });
});
