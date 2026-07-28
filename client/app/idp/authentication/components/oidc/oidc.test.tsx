import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-config", () => ({
  useGetAuthConfig: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("./oidc-list", () => ({ OidcList: () => <div data-testid="oidc-list" /> }));

import { OIDC } from "./oidc";

describe("OIDC", () => {
  it("renders the OIDC list", () => {
    render(<OIDC />);
    expect(screen.getByTestId("oidc-list")).toBeInTheDocument();
  });
});
