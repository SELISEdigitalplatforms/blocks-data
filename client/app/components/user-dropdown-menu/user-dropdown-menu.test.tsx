import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

let userResult: { data: unknown };
vi.mock("@/idp/iam/hooks/use-user", () => ({
  useGetUser: () => userResult,
}));
vi.mock("@/components/auth/log-out-button", () => ({
  LogOutButton: () => <span>Log out</span>,
}));

import { UserDropdownMenu } from "./user-dropdown-menu";

const renderMenu = () =>
  render(
    <MemoryRouter>
      <UserDropdownMenu />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("UserDropdownMenu", () => {
  it("shows the user initials when there is no profile image", () => {
    userResult = { data: { data: { firstName: "Jane", lastName: "Doe" } } };
    renderMenu();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("renders the profile image when available", () => {
    userResult = {
      data: { data: { firstName: "Jane", lastName: "Doe", profileImageUrl: "http://img" } },
    };
    renderMenu();
    expect(screen.getByAltText("Profile")).toHaveAttribute("src", "http://img");
  });

  it("falls back to the user icon when there is no name or image", () => {
    userResult = { data: { data: { firstName: "", lastName: "" } } };
    const { container } = renderMenu();
    // lucide UserRound renders an svg inside the trigger.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
