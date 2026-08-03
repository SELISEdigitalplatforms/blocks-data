import type React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/guards/protected-guard", () => ({
  ProtectedGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ImpersonationChecker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ImpersonationTerminator: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/layouts/console-header/console-header", () => ({
  ConsoleHeader: () => null,
}));

import { ConsoleLayout } from "./console-layout";

describe("layouts/console-layout ConsoleLayout", () => {
  it("renders the routed outlet content", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<ConsoleLayout />}>
            <Route index element={<div>outlet-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("outlet-content")).toBeInTheDocument();
  });
});
