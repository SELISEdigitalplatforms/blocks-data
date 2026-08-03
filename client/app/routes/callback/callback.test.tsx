import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setAuthenticated = vi.fn();
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setAuthenticated }),
}));
vi.mock("@/constants/endpoint.constant", () => ({
  API_BASES: { IDP: "https://idp.test" },
}));

import CallbackPage from "./callback";

const originalLocation = window.location;

function renderAt(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/callback${query}`]}>
      <CallbackPage />
    </MemoryRouter>,
  );
}

describe("callback LoginCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("authenticates and redirects to /console on success", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderAt("?code=c&state=s&error=&tenant_id=t");
    await waitFor(() => expect(setAuthenticated).toHaveBeenCalled());
    expect(window.location.href).toBe("/console");
  });

  it("redirects to the login error page on a failed response", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderAt("?code=c");
    await waitFor(() =>
      expect(window.location.href).toBe("/login?error=callback_failed"),
    );
  });

  it("redirects to the login error page when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("boom"));
    renderAt("?code=c");
    await waitFor(() =>
      expect(window.location.href).toBe("/login?error=callback_error"),
    );
  });
});
