import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data-gateway/pages/logs", () => ({
  DataServiceLogs: () => <div>data-gateway-logs-child</div>,
}));

import DataGatewayLogsPage from "./data-gateway-logs";

describe("dashboard/data-gateway-logs DataGatewayLogsPage", () => {
  it("renders its DataServiceLogs child", () => {
    render(<DataGatewayLogsPage />);
    expect(screen.getByText("data-gateway-logs-child")).toBeInTheDocument();
  });
});
