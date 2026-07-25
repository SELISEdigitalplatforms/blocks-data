import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./sso-provider-config-form-fields", () => ({
  SSOProviderConfigFormField: () => <div data-testid="config-fields" />,
}));
vi.mock("@blocks-idp/authentication/components/sso-initial-roles", () => ({
  SSOInitialRoles: () => <div data-testid="initial-roles" />,
}));
vi.mock("@blocks-idp/authentication/components/sso-initial-permissions", () => ({
  SSOInitialPermissions: () => <div data-testid="initial-permissions" />,
}));

import { SSOProviderConfigGithubForm } from "./sso-provider-config-github-form";
import { SSOProviderConfigGoogleForm } from "./sso-provider-config-google-form";
import { SSOProviderConfigLinkedINForm } from "./sso-provider-config-linkedin-form";
import { SSOProviderConfigMicrosoftForm } from "./sso-provider-config-microsoft-form";
import { SSOProviderConfigXForm } from "./sso-provider-config-x-form";

const forms = [
  ["Github", SSOProviderConfigGithubForm],
  ["Google", SSOProviderConfigGoogleForm],
  ["Linkedin", SSOProviderConfigLinkedINForm],
  ["Microsoft", SSOProviderConfigMicrosoftForm],
  ["X", SSOProviderConfigXForm],
] as const;

afterEach(() => vi.clearAllMocks());

describe("SSO OAuth provider config forms", () => {
  it.each(forms)("%s form renders its general fields, roles and save button", (_name, FormComp) => {
    render(
      <MemoryRouter>
        <FormComp save={vi.fn()} configuration={undefined as never} />
      </MemoryRouter>,
    );
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByTestId("config-fields")).toBeInTheDocument();
    expect(screen.getByTestId("initial-roles")).toBeInTheDocument();
    expect(screen.getByTestId("initial-permissions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
