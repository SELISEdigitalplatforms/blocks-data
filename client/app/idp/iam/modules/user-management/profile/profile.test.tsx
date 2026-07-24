import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "x-key" }));

let queryValue = "details";
const setTabId = vi.fn((v: string) => (queryValue = v));
vi.mock("nuqs", () => ({
  useQueryState: () => [queryValue, setTabId],
}));

const useGetUser = vi.fn();
const useGetUserById = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUser: () => useGetUser(),
  useGetUserById: (...a: unknown[]) => useGetUserById(...a),
}));

vi.mock("@blocks-idp/iam/components/profile-details", () => ({
  ProfileDetails: () => <div data-testid="profile-details" />,
}));
vi.mock("../update-user", () => ({ UpdateUser: () => <div data-testid="update-user" /> }));
vi.mock("../user-devices", () => ({ UserDevices: () => <div data-testid="user-devices" /> }));
vi.mock("../user-histories", () => ({ UserHistories: () => <div data-testid="user-histories" /> }));
vi.mock("../user-pat", () => ({ UserPats: () => <div data-testid="user-pats" /> }));

import { Profile, UserProfile } from "./profile";

afterEach(() => {
  vi.clearAllMocks();
  queryValue = "details";
});

describe("Profile", () => {
  it("renders nothing while the user is loading", () => {
    useGetUser.mockReturnValue({ isPending: true, isLoading: false, data: undefined });
    const { container } = render(<Profile />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the user profile once the user resolves", () => {
    useGetUser.mockReturnValue({
      isPending: false,
      isLoading: false,
      data: { data: { itemId: "u1" } },
    });
    useGetUserById.mockReturnValue({ data: { data: { firstName: "Jane", lastName: "Doe" } } });
    render(<Profile />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByTestId("profile-details")).toBeInTheDocument();
  });
});

describe("UserProfile", () => {
  it("shows the details tab with the update-user action by default", () => {
    useGetUserById.mockReturnValue({ data: { data: { firstName: "Al", lastName: "Bee" } } });
    render(<UserProfile id="u1" />);
    expect(screen.getByText("Al Bee")).toBeInTheDocument();
    expect(screen.getByTestId("update-user")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Details" })).toBeInTheDocument();
  });

  it("switches the active tab when a tab trigger is clicked", async () => {
    const user = userEvent.setup();
    useGetUserById.mockReturnValue({ data: { data: { firstName: "Al", lastName: "Bee" } } });
    render(<UserProfile id="u1" />);
    await user.click(screen.getByRole("tab", { name: "Devices" }));
    expect(setTabId).toHaveBeenCalledWith("devices");
  });
});
