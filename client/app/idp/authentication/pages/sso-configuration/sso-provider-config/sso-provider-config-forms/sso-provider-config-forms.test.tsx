import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SSO_PROVIDERS } from "@blocks-idp/authentication/constants/sso-providers.constant";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetSsoCredentialById = vi.fn();
const mutateAsync = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-sso", () => ({
  useGetSsoCredentialById: (...a: unknown[]) => useGetSsoCredentialById(...a),
  useSaveSsoCredential: () => ({ mutateAsync }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

const { formStub } = vi.hoisted(() => {
  const sampleConfig = {
    audience: "aud",
    clientId: "cid",
    clientSecret: "sec",
    userPermissions: [{ resource: "res1" }],
    userRoles: [{ slug: "role1" }],
    provider: "google",
    redirectUrl: "https://cb",
  };
  const formStub =
    (name: string) =>
    ({ save }: { save: (d: unknown) => void }) => (
      <button data-testid={name} onClick={() => save(sampleConfig)}>
        {name}
      </button>
    );
  return { formStub, sampleConfig };
});

vi.mock("./sso-provider-config-google-form", () => ({
  SSOProviderConfigGoogleForm: formStub("google-form"),
}));
vi.mock("./sso-provider-config-github-form", () => ({
  SSOProviderConfigGithubForm: formStub("github-form"),
}));
vi.mock("./sso-provider-config-linkedin-form", () => ({
  SSOProviderConfigLinkedINForm: formStub("linkedin-form"),
}));
vi.mock("./sso-provider-config-microsoft-form", () => ({
  SSOProviderConfigMicrosoftForm: formStub("microsoft-form"),
}));
vi.mock("./sso-provider-config-x-form", () => ({
  SSOProviderConfigXForm: formStub("x-form"),
}));
vi.mock("./sso-provider-config-blocks-own-sso-form", () => ({
  SSOProviderConfigOwnSSOForm: formStub("ownsso-form"),
}));

import { SsoProviderConfigForms } from "./sso-provider-config-forms";

afterEach(() => vi.clearAllMocks());

describe("SsoProviderConfigForms", () => {
  it("renders the matching provider form", () => {
    useGetSsoCredentialById.mockReturnValue({ data: null });
    render(<SsoProviderConfigForms provider={SSO_PROVIDERS.github} id="c1" />);
    expect(screen.getByTestId("github-form")).toBeInTheDocument();
  });

  it("renders nothing for an unsupported provider", () => {
    useGetSsoCredentialById.mockReturnValue({ data: null });
    const { container } = render(
      <SsoProviderConfigForms provider={SSO_PROVIDERS.apple} id="c1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("saves an existing credential and shows success without navigating", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true, itemId: "c1" });
    useGetSsoCredentialById.mockReturnValue({ data: null });
    render(<SsoProviderConfigForms provider={SSO_PROVIDERS.google} id="c1" />);
    await user.click(screen.getByTestId("google-form"));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "c1",
          initialPermissions: ["res1"],
          initialRoles: ["role1"],
          projectKey: "tenant-1",
        }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to the new credential when saving without an id", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true, itemId: "new-1" });
    useGetSsoCredentialById.mockReturnValue({ data: null });
    render(<SsoProviderConfigForms provider={SSO_PROVIDERS.google} id="" />);
    await user.click(screen.getByTestId("google-form"));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/services/authentication/sso-configuration?provider=google&id=new-1",
      ),
    );
  });

  it("shows an error toast when the save fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { clientId: "bad" } });
    useGetSsoCredentialById.mockReturnValue({ data: null });
    render(<SsoProviderConfigForms provider={SSO_PROVIDERS.google} id="c1" />);
    await user.click(screen.getByTestId("google-form"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { clientId: "bad" } }));
  });
});
