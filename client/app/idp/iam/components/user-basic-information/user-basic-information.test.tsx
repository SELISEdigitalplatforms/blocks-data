import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let userResult: { isLoading: boolean; data: unknown };
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => userResult,
}));

import { UserBasicInformation } from "./user-basic-information";

afterEach(() => vi.clearAllMocks());

describe("UserBasicInformation", () => {
  it("renders nothing once loaded with no user data", () => {
    userResult = { isLoading: false, data: undefined };
    const { container } = render(<UserBasicInformation id="u1" projectKey="t1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the basic information for an active user", () => {
    userResult = {
      isLoading: false,
      data: {
        data: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          logInCount: 5,
          active: true,
          lastLoggedInTime: "2026-07-01T10:00:00Z",
          userCreationType: 1,
        },
      },
    };
    render(<UserBasicInformation id="u1" projectKey="t1" />);
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows an inactive badge and dash defaults for a sparse user", () => {
    userResult = {
      isLoading: false,
      data: { data: { firstName: "No", lastName: "Logins", active: false } },
    };
    render(<UserBasicInformation id="u1" projectKey="t1" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    // logInCount + latest login fall back to dashes.
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("renders skeletons while loading", () => {
    userResult = { isLoading: true, data: undefined };
    const { container } = render(<UserBasicInformation id="u1" projectKey="t1" />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
