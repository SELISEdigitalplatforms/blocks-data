import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const authState: { isAuthenticated: boolean } = { isAuthenticated: false };

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>(
      "react-router",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => authState,
}));

vi.mock("./last-app-path.storage", () => ({
  getSafeReturnPathFromStorage: () => "/console/last",
}));

import { PublicGuard } from "./public-guard";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicGuard>
        <div>child-content</div>
      </PublicGuard>
    </MemoryRouter>,
  );
}

describe("PublicGuard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    authState.isAuthenticated = false;
  });
  afterEach(() => vi.clearAllMocks());

  it("renders children for an unauthenticated visitor", async () => {
    renderAt("/login");
    expect(await screen.findByText("child-content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user away from a non-login route", async () => {
    authState.isAuthenticated = true;
    renderAt("/console");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/console", { replace: true }),
    );
  });

  it("sends an authenticated user on /login to the stored return path", async () => {
    authState.isAuthenticated = true;
    renderAt("/login");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/console/last", {
        replace: true,
      }),
    );
  });

  it("keeps an authenticated user on /login during an SSO callback", async () => {
    authState.isAuthenticated = true;
    renderAt("/login?code=abc&state=xyz");
    expect(await screen.findByText("child-content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps an authenticated user on /login when forceLogin is set", async () => {
    authState.isAuthenticated = true;
    renderAt("/login?forceLogin=1");
    expect(await screen.findByText("child-content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
