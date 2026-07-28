import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/oidc/error-screen", () => ({
  OIDCErrorScreen: () => <div>oidc-error-screen</div>,
}));

import OidcErrorPage from "./error";

describe("oidc/error OidcErrorPage", () => {
  it("renders the OIDC error screen", () => {
    render(<OidcErrorPage />);
    expect(screen.getByText("oidc-error-screen")).toBeInTheDocument();
  });
});
