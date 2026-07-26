import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/pages/organization-detail/organization-detail", () => ({
  OrganizationDetail: () => <div>iam-org-detail-child</div>,
}));

import IamOrgDetailPage from "./iam-org-detail";

describe("dashboard/iam-org-detail IamOrgDetailPage", () => {
  it("reads the :itemId route param and renders its child", () => {
    render(
      <MemoryRouter initialEntries={["/detail/abc-123"]}>
        <Routes>
          <Route path="/detail/:itemId" element={<IamOrgDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("iam-org-detail-child")).toBeInTheDocument();
  });
});
