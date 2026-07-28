import type React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/guards/public-guard", () => ({
  PublicGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { PublicLayout } from "./public-layout";

describe("layouts/public-layout PublicLayout", () => {
  it("renders the routed outlet content", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<div>outlet-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("outlet-content")).toBeInTheDocument();
  });
});
