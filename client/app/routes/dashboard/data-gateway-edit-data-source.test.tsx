import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data-gateway/pages/edit-data-source-page", () => ({
  default: () => <div>edit-data-source-child</div>,
}));

import DataGatewayEditDataSourcePage from "./data-gateway-edit-data-source";

describe("dashboard/data-gateway-edit-data-source DataGatewayEditDataSourcePage", () => {
  it("renders the edit data source page", () => {
    render(<DataGatewayEditDataSourcePage />);
    expect(screen.getByText("edit-data-source-child")).toBeInTheDocument();
  });
});
