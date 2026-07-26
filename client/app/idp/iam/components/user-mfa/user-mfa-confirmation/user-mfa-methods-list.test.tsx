import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let config: { isLoading: boolean; isFetching: boolean; data?: { userMfaType: number[] } };
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGetMFAConfig: () => config,
}));

import { UserMFAMethodList } from "./user-mfa-methods-list";

afterEach(() => vi.clearAllMocks());

describe("UserMFAMethodList", () => {
  it("shows skeletons while loading", () => {
    config = { isLoading: true, isFetching: false };
    const { container } = render(<UserMFAMethodList selected={0} setSelected={vi.fn()} projectKey="t1" />);
    expect(container.querySelector("[class*='w-']")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("lists the available MFA methods from the config", () => {
    config = { isLoading: false, isFetching: false, data: { userMfaType: [1, 2] } };
    render(<UserMFAMethodList selected={0} setSelected={vi.fn()} projectKey="t1" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("renders an empty radio group when no methods are configured", () => {
    config = { isLoading: false, isFetching: false, data: { userMfaType: [] } };
    render(<UserMFAMethodList selected={0} setSelected={vi.fn()} projectKey="t1" />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("calls setSelected when a method is chosen", async () => {
    const user = userEvent.setup();
    const setSelected = vi.fn();
    config = { isLoading: false, isFetching: false, data: { userMfaType: [1, 2] } };
    render(<UserMFAMethodList selected={0} setSelected={setSelected} projectKey="t1" />);
    await user.click(screen.getByText("Email"));
    expect(setSelected).toHaveBeenCalledWith(2);
  });
});
