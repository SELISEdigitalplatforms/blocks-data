import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const showErrorToast = vi.fn();
const authState = { isAuthenticated: false };

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>(
      "react-router",
    );
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@seliseblocks/genesis-os", () => ({
  useAuthStore: () => authState,
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...args: unknown[]) => showErrorToast(...args),
}));
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (k: string) => `val-${k}`,
}));
vi.mock("@/components/blocks-login-page", () => ({
  BlocksLoginPage: ({
    onLogin,
    isLoading,
  }: {
    onLogin: () => void;
    isLoading: boolean;
  }) => (
    <button onClick={onLogin} disabled={isLoading}>
      login
    </button>
  ),
}));

import LoginSimplePage from "./login-simple";

const originalLocation = window.location;

describe("auth/login-simple LoginSimplePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    Object.defineProperty(window, "location", {
      value: { href: "", origin: "https://app.test" },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  it("redirects to /console when already authenticated", async () => {
    authState.isAuthenticated = true;
    render(<LoginSimplePage />);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/console", { replace: true }),
    );
  });

  it("navigates to the authorization URL returned by initiate", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: () => Promise.resolve({ redirect_uri: "https://idp/authorize" }),
    } as Response);
    render(<LoginSimplePage />);
    await userEvent.click(screen.getByText("login"));
    await waitFor(() =>
      expect(window.location.href).toBe("https://idp/authorize"),
    );
  });

  it("shows an error toast when no authorization URL comes back", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: () => Promise.resolve({}),
    } as Response);
    render(<LoginSimplePage />);
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("shows an error toast when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("down"));
    render(<LoginSimplePage />);
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
