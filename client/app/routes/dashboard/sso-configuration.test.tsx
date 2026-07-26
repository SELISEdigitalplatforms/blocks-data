import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/sso-configuration", () => ({
  SSOConfiguration: ({
    params,
  }: {
    params: { provider: string; id: string };
  }) => (
    <div>
      sso:{params.provider}:{params.id}
    </div>
  ),
}));

import SsoConfigurationPage from "./sso-configuration";

describe("dashboard/sso-configuration SsoConfigurationPage", () => {
  it("forwards the provider and id query params", () => {
    render(
      <MemoryRouter initialEntries={["/sso?provider=google&id=42"]}>
        <SsoConfigurationPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("sso:google:42")).toBeInTheDocument();
  });

  it("defaults the id to an empty string when absent", () => {
    render(
      <MemoryRouter initialEntries={["/sso?provider=apple"]}>
        <SsoConfigurationPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("sso:apple:")).toBeInTheDocument();
  });
});
