import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/identifier/pages/services/managed-services", () => ({
  ManagedServices: () => <div>managed-services-child</div>,
}));

import ManagedServicesPage from "./managed-services";

describe("dashboard/managed-services ManagedServicesPage", () => {
  it("renders its ManagedServices child", () => {
    render(<ManagedServicesPage />);
    expect(screen.getByText("managed-services-child")).toBeInTheDocument();
  });
});
