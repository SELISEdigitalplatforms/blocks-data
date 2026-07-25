import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({ userId: "u1", projectKey: "t1" }));
vi.mock("../profile-mfa", async () => {
  const React = await import("react");
  return { profileMfaContext: React.createContext(ctxValue) };
});

let config: { isLoading: boolean; isFetching: boolean; data?: { userMfaType: number[] } };
let userData: { data: { mfaEnabled: boolean; userMfaType: number } } | undefined;
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGetMFAConfig: () => config,
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
}));

import { ProfileMFAMethodList } from "./profile-mfa-methods-list";

beforeEach(() => {
  config = { isLoading: false, isFetching: false, data: { userMfaType: [1, 2] } };
  userData = { data: { mfaEnabled: true, userMfaType: 2 } };
});
afterEach(() => vi.clearAllMocks());

describe("ProfileMFAMethodList", () => {
  it("shows skeletons while loading", () => {
    config = { isLoading: true, isFetching: false };
    render(<ProfileMFAMethodList selected={0} setSelected={vi.fn()} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("lists methods and marks the enabled one with a badge", () => {
    render(<ProfileMFAMethodList selected={0} setSelected={vi.fn()} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("calls setSelected on choosing a method", async () => {
    const user = userEvent.setup();
    const setSelected = vi.fn();
    render(<ProfileMFAMethodList selected={0} setSelected={setSelected} />);
    await user.click(screen.getByText("Authenticator app"));
    expect(setSelected).toHaveBeenCalledWith(1);
  });
});
