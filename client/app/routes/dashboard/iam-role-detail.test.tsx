import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/role-management", () => ({
  RoleDetails: () => <div>iam-role-detail-child</div>,
}));

import IamRoleDetailPage from "./iam-role-detail";

describe("dashboard/iam-role-detail IamRoleDetailPage", () => {
  it("reads the :id route param and renders its child", () => {
    render(
      <MemoryRouter initialEntries={["/detail/abc-123"]}>
        <Routes>
          <Route path="/detail/:id" element={<IamRoleDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("iam-role-detail-child")).toBeInTheDocument();
  });
});
