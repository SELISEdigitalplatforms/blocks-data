import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setTabId = vi.fn();
vi.mock("nuqs", () => ({ useQueryState: () => ["users", setTabId] }));
vi.mock("@/lib/utils", () => ({ clearQueryString: vi.fn(), cn: (...a: unknown[]) => a.filter(Boolean).join(" ") }));
vi.mock("@blocks-idp/iam/modules/user-management/invite-user/invite-user", () => ({
  InviteUser: () => <div data-testid="invite-user" />,
}));
vi.mock("@blocks-idp/iam/modules/user-management/users", () => ({
  Users: () => <div data-testid="users" />,
}));
vi.mock("@blocks-idp/iam/modules/user-management/signup-settings", () => ({
  SignupSettings: () => <div data-testid="signup-settings" />,
}));

import { IamManagement } from "./iam-management";

afterEach(() => vi.clearAllMocks());

describe("IamManagement", () => {
  it("renders the IAM heading, users tab and actions", () => {
    render(<IamManagement />);
    expect(screen.getByText("Identity and Access Management")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByTestId("users")).toBeInTheDocument();
    expect(screen.getByTestId("invite-user")).toBeInTheDocument();
  });
});
