import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data-gateway/components/data-service", () => ({
  DataService: () => <div>data-gateway-schemas-child</div>,
}));

import DataGatewaySchemasPage from "./data-gateway-schemas";

describe("dashboard/data-gateway-schemas DataGatewaySchemasPage", () => {
  it("renders its DataService child", () => {
    render(<DataGatewaySchemasPage />);
    expect(screen.getByText("data-gateway-schemas-child")).toBeInTheDocument();
  });
});
