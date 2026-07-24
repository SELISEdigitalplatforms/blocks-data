import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const setAuthenticated = vi.fn();
const setTokens = vi.fn();
const verifyOidc = vi.fn();
let runtimeBase = "https://localhost:4000";

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: () => runtimeBase,
}));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setAuthenticated, setTokens }),
}));
vi.mock("@blocks-idp/authentication/pages/oidc/oidc-signin", () => ({
  OIDCSignin: () => <div>oidc-signin</div>,
}));
vi.mock("@blocks-idp/authentication/pages/oidc/permission-wrapper", () => ({
  OIDCPermissionWrapper: () => <div>oidc-permission</div>,
}));
vi.mock("@blocks-idp/authentication/services/auth.service", () => ({
  authService: { verifyOidc: (...args: unknown[]) => verifyOidc(...args) },
}));

import OidcIndexPage from "./index";

function renderAt(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/oidc${query}`]}>
      <OidcIndexPage />
    </MemoryRouter>,
  );
}

describe("oidc/index OidcIndexPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeBase = "https://localhost:4000";
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the sign-in screen when there are no params", () => {
    renderAt("");
    expect(screen.getByText("oidc-signin")).toBeInTheDocument();
  });

  it("shows the permission wrapper when a userName is present", () => {
    renderAt("?userName=alice");
    expect(screen.getByText("oidc-permission")).toBeInTheDocument();
  });

  it("exchanges the code and navigates to the data gateway on success", async () => {
    verifyOidc.mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
    });
    const { container } = renderAt("?code=c&state=s");
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/services/data-gateway", {
        replace: true,
      }),
    );
    expect(setTokens).toHaveBeenCalledWith("a", "r");
    expect(setAuthenticated).toHaveBeenCalled();
  });

  it("does not store tokens when not running on localhost", async () => {
    runtimeBase = "https://prod.example.com";
    verifyOidc.mockResolvedValue({ access_token: "a", refresh_token: "r" });
    renderAt("?code=c&state=s");
    await waitFor(() => expect(setAuthenticated).toHaveBeenCalled());
    expect(setTokens).not.toHaveBeenCalled();
  });

  it("navigates to the error page when the exchange fails", async () => {
    verifyOidc.mockRejectedValue(new Error("bad"));
    renderAt("?code=c&state=s");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/oidc/error"),
    );
  });
});
