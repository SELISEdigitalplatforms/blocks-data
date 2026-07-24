import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/oidc/forgot-password", () => ({
  OidcForgotPassword: () => <div>oidc-forgot-password</div>,
}));

import OidcForgotPasswordPage from "./forgot-password";

describe("oidc/forgot-password OidcForgotPasswordPage", () => {
  it("renders the OIDC forgot-password screen", () => {
    render(<OidcForgotPasswordPage />);
    expect(screen.getByText("oidc-forgot-password")).toBeInTheDocument();
  });
});
