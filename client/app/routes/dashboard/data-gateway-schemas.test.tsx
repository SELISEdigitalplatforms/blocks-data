import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The DataService wrapper only existed to pick between the schemas page and the
// data-source instructions; the route renders the page directly now.
vi.mock("@/data-gateway/components/schema-details-page", () => ({
  SchemaDetailsPage: () => <div>data-gateway-schemas-child</div>,
}));

import DataGatewaySchemasPage from "./data-gateway-schemas";

describe("dashboard/data-gateway-schemas DataGatewaySchemasPage", () => {
  it("renders the schemas page", () => {
    render(<DataGatewaySchemasPage />);
    expect(screen.getByText("data-gateway-schemas-child")).toBeInTheDocument();
  });
});
