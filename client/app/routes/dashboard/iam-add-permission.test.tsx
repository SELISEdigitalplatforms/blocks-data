import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/permission-management", () => ({
  AddPermission: () => <div>iam-add-permission-child</div>,
}));

import IamAddPermissionPage from "./iam-add-permission";

describe("dashboard/iam-add-permission IamAddPermissionPage", () => {
  it("renders its AddPermission child", () => {
    render(<IamAddPermissionPage />);
    expect(screen.getByText("iam-add-permission-child")).toBeInTheDocument();
  });
});
