import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/permission-management/permission-details", () => ({
  PermissionDetails: () => <div>iam-permission-detail-child</div>,
}));

import IamPermissionDetailPage from "./iam-permission-detail";

describe("dashboard/iam-permission-detail IamPermissionDetailPage", () => {
  it("reads the :id route param and renders its child", () => {
    render(
      <MemoryRouter initialEntries={["/detail/abc-123"]}>
        <Routes>
          <Route path="/detail/:id" element={<IamPermissionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("iam-permission-detail-child")).toBeInTheDocument();
  });
});
