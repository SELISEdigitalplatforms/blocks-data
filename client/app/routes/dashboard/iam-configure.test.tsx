import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/user-management", () => ({
  Configure: () => <div>iam-configure-child</div>,
}));

import IamConfigurePage from "./iam-configure";

describe("dashboard/iam-configure IamConfigurePage", () => {
  it("renders its Configure child", () => {
    render(<IamConfigurePage />);
    expect(screen.getByText("iam-configure-child")).toBeInTheDocument();
  });
});
