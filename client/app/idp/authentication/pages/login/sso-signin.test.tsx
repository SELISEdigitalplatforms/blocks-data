import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let isPending = false;
vi.mock("@blocks-idp/authentication/hooks/use-sso-activation", () => ({
  useSsoActivation: () => ({ isPending }),
}));

vi.mock("@blocks-idp/authentication/components/sso-signin-card", () => ({
  SSOSigninCard: ({ providerConfig }: { providerConfig: { provider: string } }) => (
    <div data-testid="sso-card">{providerConfig.provider}</div>
  ),
}));

vi.mock("@/components/loader-spinner/loader-spinner", () => ({
  default: () => <div data-testid="spinner" />,
}));

import { SsoSignin } from "./sso-signin";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("SsoSignin", () => {
  it("renders a card only for providers present in the login option", () => {
    render(
      <SsoSignin
        loginOption={
          {
            ssoInfo: [
              { provider: "github", audience: "a1" },
              { provider: "google", audience: "a2" },
            ],
          } as never
        }
      />,
    );
    const cards = screen.getAllByTestId("sso-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
  });

  it("renders no cards when there is no sso info", () => {
    render(<SsoSignin loginOption={{ ssoInfo: [] } as never} />);
    expect(screen.queryByTestId("sso-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
  });

  it("shows the loading overlay while activation is pending", () => {
    isPending = true;
    render(
      <SsoSignin loginOption={{ ssoInfo: [{ provider: "github", audience: "a" }] } as never} />,
    );
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });
});
