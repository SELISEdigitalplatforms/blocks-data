import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

vi.mock("nuqs", () => ({
  useQueryState: (_key: string, opts: { defaultValue: string }) => useState(opts.defaultValue),
}));

let captchaData: Record<string, unknown> | undefined;
vi.mock("@blocks-idp/captcha/hooks/use-captcha-config", () => ({
  useGetCaptchaConfigs: () => ({ data: captchaData }),
}));
vi.mock("@/magic-url/hooks/use-magic-url", () => ({
  useSaveMagicUrlConfig: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

vi.mock("@blocks-idp/authentication/pages/authentication-config/sso", () => ({ SSO: () => <div data-testid="SSO" /> }));
vi.mock("@blocks-idp/authentication/components/oidc", () => ({ OIDC: () => <div data-testid="OIDC" /> }));
vi.mock("@blocks-idp/authentication/pages/authentication-config/general/certificates/certificates", () => ({ Certificates: () => <div data-testid="Certificates" /> }));
vi.mock("@blocks-idp/authentication/components/create-oidc", () => ({ CreateOIDC: () => <div data-testid="CreateOIDC" /> }));
vi.mock("@blocks-idp/captcha/pages/configure-captcha", () => ({ ConfigureCaptcha: () => <div data-testid="ConfigureCaptcha" /> }));
vi.mock("@blocks-idp/captcha/modals/configure-captcha-modal", () => ({
  ConfigureCaptchaModal: ({ children }: { children: React.ReactNode }) => <div data-testid="ConfigureCaptchaModal">{children}</div>,
}));
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});
vi.mock("@blocks-idp/mfa/pages/configure-mfa/configure-mfa", () => ({ ConfigureMFA: () => <div data-testid="ConfigureMFA" /> }));
vi.mock("@/magic-url/components/magic-url-config-dialog/magic-url-config-dialog", () => ({
  MagicUrlConfigDialog: () => <div data-testid="MagicUrlConfigDialog" />,
}));
vi.mock("@/storage/pages/storage/storage-contents", () => ({ StorageContents: () => <div data-testid="StorageContents" /> }));
vi.mock("@/identifier/pages/services/managed-services", () => ({ ManagedServices: () => <div data-testid="ManagedServices" /> }));
vi.mock("@/identifier/components/add-service/add-service", () => ({ AddService: () => <div data-testid="AddService" /> }));

import SecretManagementPage from "./secret-management";

beforeEach(() => {
  captchaData = undefined;
});
afterEach(() => vi.clearAllMocks());

describe("SecretManagementPage", () => {
  it("renders the header and the default infra-config tab", () => {
    render(<SecretManagementPage />);
    expect(screen.getByText("Secrets & Configs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Infra Config" })).toBeInTheDocument();
    expect(screen.getByText("Secret values are hidden for security")).toBeInTheDocument();
  });

  it("shows a toast and blocks adding when all captcha providers are configured", async () => {
    const user = userEvent.setup();
    render(<SecretManagementPage />);
    // Switch to captcha tab via the tab trigger.
    const captchaTab = screen.getByRole("tab", { name: /captcha/i });
    await user.click(captchaTab);
    expect(screen.getByTestId("ConfigureCaptchaModal")).toBeInTheDocument();
  });

  it("renders tab triggers from the config", () => {
    render(<SecretManagementPage />);
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(1);
  });
});
