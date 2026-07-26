import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let extracted: Record<string, unknown>;

vi.mock("@blocks-idp/authentication/utils/oidc-utils", () => ({
  extractOIDCParams: () => extracted,
}));
vi.mock("@/components/logo", () => ({
  Logo: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { OidcLayout, OIDCProvider, useOIDCContext } from "./oidc-layout";

function Consumer() {
  const { themeColor, projectKey } = useOIDCContext();
  return (
    <div>
      <span data-testid="theme">{themeColor}</span>
      <span data-testid="project">{projectKey ?? "none"}</span>
    </div>
  );
}

describe("oidc-layout", () => {
  it("throws when useOIDCContext is used outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/useOIDCContext must be used within OIDCProvider/);
    spy.mockRestore();
  });

  it("provides extracted params with a default theme colour", async () => {
    extracted = { projectKey: "proj-9" };
    render(
      <MemoryRouter initialEntries={["/oidc/login"]}>
        <OIDCProvider>
          <Consumer />
        </OIDCProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("project")).toHaveTextContent("proj-9"));
    expect(screen.getByTestId("theme")).toHaveTextContent("#124091");
  });

  it("renders the logo and the routed outlet once loading resolves", async () => {
    extracted = {};
    render(
      <MemoryRouter initialEntries={["/oidc/login"]}>
        <Routes>
          <Route element={<OidcLayout />}>
            <Route path="/oidc/login" element={<div>oidc-child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("oidc-child")).toBeInTheDocument();
    expect(screen.getByAltText("OIDC Logo")).toBeInTheDocument();
  });
});
