import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/user-management", () => ({
  User: () => <div>iam-user-detail-child</div>,
}));

import IamUserDetailPage from "./iam-user-detail";

describe("dashboard/iam-user-detail IamUserDetailPage", () => {
  it("reads the :id route param and renders its child", () => {
    render(
      <MemoryRouter initialEntries={["/detail/abc-123"]}>
        <Routes>
          <Route path="/detail/:id" element={<IamUserDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("iam-user-detail-child")).toBeInTheDocument();
  });
});
