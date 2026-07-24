import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/user-management/profile", () => ({
  Profile: () => <div>profile-child</div>,
}));

import ProfilePage from "./profile";

describe("dashboard/profile ProfilePage", () => {
  it("renders its Profile child", () => {
    render(<ProfilePage />);
    expect(screen.getByText("profile-child")).toBeInTheDocument();
  });
});
