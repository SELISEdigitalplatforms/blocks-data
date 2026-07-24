import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/oidc/permission-wrapper", () => ({
  OIDCPermissionWrapper: () => <div>oidc-permission-wrapper</div>,
}));

import OidcPermissionPage from "./permission";

describe("oidc/permission OidcPermissionPage", () => {
  it("renders the OIDC permission wrapper", () => {
    render(<OidcPermissionPage />);
    expect(screen.getByText("oidc-permission-wrapper")).toBeInTheDocument();
  });
});
