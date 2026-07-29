import type React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/dashboard-layout-provider", () => ({
  DashboardLayoutProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/guards/protected-guard", () => ({
  ProtectedGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/layouts/dashboard-header/dashboard-header", () => ({
  DashboardHeader: () => null,
}));
vi.mock("@/layouts/sidebar-menu-desktop/sidebar-menu-desktop", () => ({
  SidebarMenuDesktop: () => null,
}));

import { DashboardLayout } from "./admin-layout";

describe("layouts/admin-layout DashboardLayout", () => {
  it("renders the routed outlet content", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<div>outlet-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("outlet-content")).toBeInTheDocument();
  });
});
