import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { GRANT_TYPES } from "@blocks-idp/authentication/constants/authentication.constant";

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "x-key" }));

const useGetLoginOptions = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-auth", () => ({
  useGetLoginOptions: () => useGetLoginOptions(),
}));

const useGetSignUpSetting = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetSignUpSetting: () => useGetSignUpSetting(),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));

vi.mock("./signin-form", () => ({ SigninForm: () => <div data-testid="signin-form" /> }));
vi.mock("./sso-signin", () => ({ SsoSignin: () => <div data-testid="sso-signin" /> }));

import { Signin } from "./signin";

const renderSignin = (props = {}) =>
  render(
    <MemoryRouter>
      <Signin {...props} />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("Signin", () => {
  it("renders a skeleton while options load", () => {
    useGetLoginOptions.mockReturnValue({ data: undefined, isLoading: true });
    useGetSignUpSetting.mockReturnValue({ data: undefined, isLoading: false });
    renderSignin();
    expect(screen.queryByTestId("signin-form")).not.toBeInTheDocument();
    expect(screen.queryByText("Log in")).not.toBeInTheDocument();
  });

  it("returns nothing when no grant types are allowed", () => {
    useGetLoginOptions.mockReturnValue({ data: { allowedGrantTypes: [] }, isLoading: false });
    useGetSignUpSetting.mockReturnValue({ data: undefined, isLoading: false });
    const { container } = renderSignin();
    expect(container.firstChild).toBeNull();
  });

  it("renders the signin form, SSO and signup link when enabled", () => {
    useGetLoginOptions.mockReturnValue({
      data: { allowedGrantTypes: [GRANT_TYPES.password, GRANT_TYPES.social] },
      isLoading: false,
    });
    useGetSignUpSetting.mockReturnValue({
      data: { isEmailPasswordSignUpEnabled: true },
      isLoading: false,
    });
    renderSignin();
    expect(screen.getByTestId("signin-form")).toBeInTheDocument();
    expect(screen.getByTestId("sso-signin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
  });

  it("shows an error toast when an ssoError is provided", () => {
    useGetLoginOptions.mockReturnValue({
      data: { allowedGrantTypes: [GRANT_TYPES.password] },
      isLoading: false,
    });
    useGetSignUpSetting.mockReturnValue({ data: {}, isLoading: false });
    renderSignin({ ssoError: "sso failed" });
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "sso failed" });
  });
});
