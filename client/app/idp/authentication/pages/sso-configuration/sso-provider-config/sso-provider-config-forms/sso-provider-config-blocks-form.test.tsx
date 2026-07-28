import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let existingConfiguration: Record<string, unknown> | undefined;
const mutateAsync = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-sso", () => ({
  useSaveGetOIDCCredential: () => ({ data: existingConfiguration }),
  useSaveOIDCCredential: () => ({ mutateAsync }),
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

import { SSOProviderConfigBlocksForm } from "./sso-provider-config-blocks-form";

beforeEach(() => {
  existingConfiguration = {
    itemId: "cfg-1",
    audience: "https://audience.test",
    redirectUri: "https://redirect.test",
    clientSecret: "secret",
    scope: "openid email",
    isAutoRedirect: true,
  };
});
afterEach(() => vi.clearAllMocks());

describe("SSOProviderConfigBlocksForm", () => {
  it("renders the general card, fields and save button", () => {
    render(<SSOProviderConfigBlocksForm />);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByTestId("fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("submits the mapped payload and shows a success toast", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<SSOProviderConfigBlocksForm />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          redirectUri: "https://redirect.test",
          audience: "https://audience.test",
          scope: "openid email",
          isAutoRedirect: true,
          itemId: "cfg-1",
          projectKey: "t1",
        }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the save is not successful", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { audience: "bad" } });
    render(<SSOProviderConfigBlocksForm />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { audience: "bad" } }));
  });

  it("renders with default scopes when there is no existing configuration", () => {
    existingConfiguration = undefined;
    render(<SSOProviderConfigBlocksForm />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
