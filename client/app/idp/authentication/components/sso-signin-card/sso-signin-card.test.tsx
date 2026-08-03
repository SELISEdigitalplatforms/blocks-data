import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ theme: "light" }) }));

const getSocialLoginEndpoint = vi.fn();
vi.mock("@blocks-idp/authentication/services/oauth.service", () => ({
  oauthService: { getSocialLoginEndpoint: (...a: unknown[]) => getSocialLoginEndpoint(...a) },
}));

vi.mock("@blocks-idp/authentication/utils/sanitize-provider-url.util", () => ({
  sanitizeProviderUrl: (u: string) => `safe:${u}`,
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));

import { SSOSigninCard } from "./sso-signin-card";

const config = {
  provider: "google",
  audience: "aud",
  label: "Google",
  imageSrc: "light.png",
  imageSrcDark: "dark.png",
} as never;

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { href: "" },
    writable: true,
    configurable: true,
  });
});
afterEach(() => vi.clearAllMocks());

describe("SSOSigninCard", () => {
  it("renders the provider image and label when withLabel is set", () => {
    render(<SSOSigninCard providerConfig={config} withLabel />);
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "light.png");
  });

  it("redirects to the sanitized provider URL on click", async () => {
    const user = userEvent.setup();
    getSocialLoginEndpoint.mockResolvedValue({ providerUrl: "https://idp/login" });
    render(<SSOSigninCard providerConfig={config} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(getSocialLoginEndpoint).toHaveBeenCalledWith({
        provider: "google",
        audience: "aud",
        sendAsResponse: true,
      }),
    );
    expect(sessionStorage.getItem("clicked_sso_provider")).toBe("google");
    await waitFor(() => expect(window.location.href).toBe("safe:https://idp/login"));
  });

  it("shows an error toast when the endpoint returns an error", async () => {
    const user = userEvent.setup();
    getSocialLoginEndpoint.mockResolvedValue({ error: "denied" });
    render(<SSOSigninCard providerConfig={config} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "denied" }));
  });

  it("shows an error toast when no redirect URL is returned", async () => {
    const user = userEvent.setup();
    getSocialLoginEndpoint.mockResolvedValue({});
    render(<SSOSigninCard providerConfig={config} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "No redirect URL provided." }),
    );
  });

  it("shows an error toast when audience or provider is missing", async () => {
    const user = userEvent.setup();
    render(<SSOSigninCard providerConfig={{ provider: "", audience: "" } as never} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
    expect(getSocialLoginEndpoint).not.toHaveBeenCalled();
  });
});
