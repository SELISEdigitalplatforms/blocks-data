import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const setAuthenticated = vi.fn();
const showErrorToast = vi.fn();
let oidcContext: Record<string, unknown> = {};

vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/layouts/oidc-layout", () => ({ useOIDCContext: () => oidcContext }));
vi.mock("@/store/use-auth-store", () => ({ useAuthStore: () => ({ setAuthenticated }) }));
vi.mock("@blocks-idp/authentication/utils/oidc-utils", () => ({
  buildOIDCNavigationUrl: (p: string) => `/base${p}`,
  getCurrentOIDCParams: () => new URLSearchParams("a=1"),
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { OidcSigninForm, signinByEmail } from "./oidc-signin-form";

const okResponse = (body: string) => ({
  ok: true,
  text: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  oidcContext = {
    themeColor: "#123456",
    projectKey: "pk-1",
    clientId: "client-1",
    scope: "openid",
    state: "state-1",
    redirectUri: "https://rp.example.com/cb",
    nonce: "n-1",
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("signinByEmail", () => {
  it("returns the parsed token response on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse(JSON.stringify({ access_token: "tok" }))),
    );
    const res = await signinByEmail({ username: "u", password: "p", projectKey: "pk" } as never);
    expect(res.access_token).toBe("tok");
  });

  it("treats an empty body as an authenticated response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("")));
    const res = await signinByEmail({ username: "u", password: "p", projectKey: "pk" } as never);
    expect(res.access_token).toBe("authenticated");
  });

  it("throws the parsed error object on a non-ok JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve(JSON.stringify({ error: "invalid_grant" })),
    }));
    await expect(
      signinByEmail({ username: "u", password: "p", projectKey: "pk" } as never),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("throws a generic error on a non-ok non-JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: () => Promise.resolve("boom"),
    }));
    await expect(
      signinByEmail({ username: "u", password: "p", projectKey: "pk" } as never),
    ).rejects.toThrow(/HTTP 500/);
  });
});

const renderForm = () =>
  render(
    <MemoryRouter>
      <OidcSigninForm />
    </MemoryRouter>,
  );

const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText("Enter your email"), "user@example.com");
  await user.type(screen.getByPlaceholderText("Enter your password"), "secret1");
  await user.click(screen.getByRole("button", { name: "Log in" }));
};

describe("OidcSigninForm", () => {
  it("signs in and navigates to the permission page on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse(JSON.stringify({ access_token: "tok" }))),
    );
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await waitFor(() => expect(setAuthenticated).toHaveBeenCalled());
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining("/oidc/permission?")),
    );
  });

  it("redirects to MFA when the response requires it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse(JSON.stringify({ enable_mfa: true, mfaId: "m1", mfaType: 2 })),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/base/mfa-check?mfa_id=m1&mfa_type=2"),
    );
  });

  it("navigates to the error page when sign-in fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve(JSON.stringify({ error: "invalid_grant", error_description: "bad" })),
    }));
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining("/base/oidc/error")),
    );
  });

  it("shows an error toast when the project key is missing", async () => {
    oidcContext = { ...oidcContext, projectKey: "" };
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
