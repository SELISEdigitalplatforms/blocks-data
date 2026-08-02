import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

let contextValues: Record<string, unknown> = {};
vi.mock("@/layouts/oidc-layout", () => ({
  useOIDCContext: () => contextValues,
}));

const userAcknowledgement = vi.fn();
vi.mock("@blocks-idp/authentication/services/oidc-auth-flow.service", () => ({
  userAcknowledgement: (...a: unknown[]) => userAcknowledgement(...a),
}));

import { OIDCPermissionScreen } from "./permission";

const baseContext = {
  userName: "Jane",
  themeColor: "#123456",
  state: "st",
  nonce: "nc",
  scope: "openid",
  redirectUri: "https://cb.test/callback",
  clientId: "client-1",
  projectKey: "pk",
};

const renderScreen = () =>
  render(
    <MemoryRouter>
      <OIDCPermissionScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  contextValues = { ...baseContext };
  Object.defineProperty(window, "location", {
    value: { href: "" },
    writable: true,
    configurable: true,
  });
});
afterEach(() => vi.clearAllMocks());

describe("OIDCPermissionScreen", () => {
  it("greets the user and shows the consent scopes", () => {
    renderScreen();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("This portal would like to:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  it("redirects with an access_denied error on Deny", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(window.location.href).toContain("error=access_denied");
    expect(window.location.href).toContain("state=st");
  });

  it("acknowledges and redirects on Allow", async () => {
    const user = userEvent.setup();
    userAcknowledgement.mockResolvedValue({ redirectUrl: "https://cb.test/done" });
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() =>
      expect(userAcknowledgement).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          projectKey: "pk",
          isAcknowledged: true,
          username: "Jane",
        }),
      ),
    );
    await waitFor(() => expect(window.location.href).toBe("https://cb.test/done"));
  });

  it("does not acknowledge when clientId or projectKey is missing", async () => {
    const user = userEvent.setup();
    contextValues = { ...baseContext, clientId: "" };
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(userAcknowledgement).not.toHaveBeenCalled();
  });

  it("logs an error and does not redirect when there is no redirect URI on Deny", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    contextValues = { ...baseContext, redirectUri: "" };
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(spy).toHaveBeenCalledWith("No redirect URI available");
    expect(window.location.href).toBe("");
    spy.mockRestore();
  });
});
