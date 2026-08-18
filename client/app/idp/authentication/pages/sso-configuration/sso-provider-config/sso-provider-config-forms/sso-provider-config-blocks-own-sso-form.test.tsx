import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISsoProviderConfiguration } from "@blocks-idp/authentication/models/sso.model";

let selectedProject: { tenantId: string } | null;
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject }),
}));

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-sso", () => ({
  useSaveSsoCredential: () => ({ mutateAsync }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("./sso-provider-config-form-fields", () => ({
  SSOProviderConfigFormField: () => <div data-testid="fields" />,
}));

import { SSOProviderConfigOwnSSOForm } from "./sso-provider-config-blocks-own-sso-form";

const configuration = {
  provider: "ownsso",
  audience: "https://audience.test",
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://redirect.test",
  wellKnownUrl: "https://issuer.test/.well-known/openid-configuration",
} as unknown as ISsoProviderConfiguration;

const save = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  selectedProject = { tenantId: "t1" };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});
afterEach(() => vi.clearAllMocks());

describe("SSOProviderConfigOwnSSOForm", () => {
  it("renders the general card, fields and save button", () => {
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByTestId("fields")).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
  });

  it("submits the mapped payload for the selected project", async () => {
    const user = userEvent.setup();
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    await user.click(save());

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "ownsso",
          clientId: "client-1",
          clientSecret: "secret-1",
          wellKnownUrl: "https://issuer.test/.well-known/openid-configuration",
          projectKey: "t1",
        }),
      ),
    );
  });

  it("sends the bring-your-own-SSO discriminator and empty role and permission seeds", async () => {
    // ssoType 1 is what separates a customer's own provider from the built-in ones, and the
    // two empty seeds are deliberate: initial roles are granted elsewhere.
    const user = userEvent.setup();
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    await user.click(save());

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ ssoType: 1, initialRoles: [], initialPermissions: [] }),
      ),
    );
  });

  it("confirms the save to the user", async () => {
    const user = userEvent.setup();
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    await user.click(save());

    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Bring your own SSO is configured successfully",
      }),
    );
  });

  it("reports a rejected save and does not claim success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { clientId: ["already in use"] } });
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    await user.click(save());

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: { clientId: ["already in use"] } }),
    );
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("falls back to an empty project key when no project is selected", async () => {
    const user = userEvent.setup();
    selectedProject = null;
    render(<SSOProviderConfigOwnSSOForm configuration={configuration} />);

    await user.click(save());

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ projectKey: "" })),
    );
  });

  it("refuses to submit an unconfigured form", async () => {
    // With no configuration the fields start empty, and the schema requires a client id, a
    // secret and a well known URL, so nothing should reach the server.
    const user = userEvent.setup();
    render(<SSOProviderConfigOwnSSOForm configuration={undefined as never} />);

    await user.click(save());

    await waitFor(() => expect(save()).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("refuses a well known URL that is not a URL", async () => {
    const user = userEvent.setup();
    render(
      <SSOProviderConfigOwnSSOForm
        configuration={{ ...configuration, wellKnownUrl: "not-a-url" } as ISsoProviderConfiguration}
      />,
    );

    await user.click(save());

    await waitFor(() => expect(save()).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
