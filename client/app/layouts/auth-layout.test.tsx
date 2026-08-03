import type React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/guards/public-guard", () => ({
  PublicGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/logo", () => ({
  Logo: () => null,
}));
vi.mock("@blocks-idp/authentication/components/auth-layout/blocks-info", () => ({
  BlockInfo: () => null,
}));

import { AuthLayout } from "./auth-layout";

describe("layouts/auth-layout AuthLayout", () => {
  it("renders the routed outlet content", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route index element={<div>outlet-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("outlet-content")).toBeInTheDocument();
  });
});
