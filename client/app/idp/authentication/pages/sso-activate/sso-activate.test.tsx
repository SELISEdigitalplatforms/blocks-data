import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const setAuthenticated = vi.fn();
const setTokens = vi.fn();
const showErrorToast = vi.fn();
const getSocialLoginEndpoint = vi.fn();

vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: (e: unknown) => !!(e as { errors?: unknown })?.errors }));
vi.mock("@/lib/get-api-path", () => ({ getApiUrl: () => "https://api.example.com/token" }));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "blocks-key" }));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setAuthenticated, setTokens }),
}));
vi.mock("@blocks-idp/authentication/constants/sso-providers.constant", () => ({
  SOCIAL_AUTH_PROVIDERS_CONFIG: { google: { imageSrc: "/google.svg" } },
  SSO_PROVIDERS: {},
}));
vi.mock("@blocks-idp/authentication/services/oauth.service", () => ({
  oauthService: { getSocialLoginEndpoint: (...a: unknown[]) => getSocialLoginEndpoint(...a) },
}));
vi.mock("@blocks-idp/authentication/utils/sanitize-provider-url.util", () => ({
  sanitizeProviderUrl: (u: string) => u,
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { SsoActivate } from "./sso-activate";

const renderComp = (code = "auth-code") =>
  render(
    <MemoryRouter>
      <SsoActivate oauthParams={{ code, username: "jane@example.com" }} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("clicked_sso_provider", "google");
  sessionStorage.setItem("clicked_sso_audience", "aud-1");
});
afterEach(() => vi.unstubAllGlobals());

describe("SsoActivate", () => {
  it("renders the provider account and terms checkbox", async () => {
    renderComp();
    expect(await screen.findByText(/Signing in with/)).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    // Continue is disabled until terms are accepted.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("activates the account after agreeing to terms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: "a" }) }),
    );
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(setAuthenticated).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/console");
  });

  it("shows an error toast when activation returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ errors: "denied" }) }),
    );
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "denied" }));
  });

  it("redirects to a different account via the social login endpoint", async () => {
    getSocialLoginEndpoint.mockResolvedValue({ providerUrl: "https://accounts.google.com/o" });
    const setHref = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, set href(v: string) { setHref(v); } },
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup();
    renderComp();
    await user.click(await screen.findByText(/Use a different/));
    await waitFor(() =>
      expect(setHref).toHaveBeenCalledWith("https://accounts.google.com/o"),
    );
  });

  it("shows an error toast when activation code is missing", async () => {
    const user = userEvent.setup();
    renderComp("");
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "Code is missing" }));
  });
});
