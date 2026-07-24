import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/oidc/oidc-signin", () => ({
  OIDCSignin: () => <div>oidc-signin-screen</div>,
}));

import OidcLoginPage from "./login";

describe("oidc/login OidcLoginPage", () => {
  it("renders the OIDC sign-in screen", () => {
    render(<OidcLoginPage />);
    expect(screen.getByText("oidc-signin-screen")).toBeInTheDocument();
  });
});
