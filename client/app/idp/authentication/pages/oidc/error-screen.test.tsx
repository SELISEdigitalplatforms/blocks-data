import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/layouts/oidc-layout", () => ({
  useOIDCContext: () => ({ themeColor: "#123456" }),
}));

import { OIDCErrorScreen } from "./error-screen";

const renderAt = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/oidc/error${search}`]}>
      <OIDCErrorScreen />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("OIDCErrorScreen", () => {
  it("shows the generic access-blocked message when there is no error param", () => {
    renderAt();
    expect(screen.getByText("Access Blocked")).toBeInTheDocument();
    expect(screen.getByText(/couldn't sign you in/i)).toBeInTheDocument();
  });

  it("shows the api error description and formatted code when present", () => {
    renderAt("?error=access_denied&error_description=User%20denied");
    expect(screen.getByText("Sign In Failed")).toBeInTheDocument();
    expect(screen.getByText("User denied")).toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("renders a back to sign in link", () => {
    renderAt();
    expect(screen.getByRole("button", { name: "Back to Sign In" })).toBeInTheDocument();
  });
});
