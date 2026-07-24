import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/pages/iam-management", () => ({
  IamManagement: () => <div>iam-child</div>,
}));

import IamPage from "./iam";

describe("dashboard/iam IamPage", () => {
  it("renders its IamManagement child", () => {
    render(<IamPage />);
    expect(screen.getByText("iam-child")).toBeInTheDocument();
  });
});
