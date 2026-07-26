import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogTrigger } from "@/components/ui-kits/dialog/dialog";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let captchaData: { configurations: Array<{ provider: string }> } | undefined;
const mutateAsync = vi.fn();
vi.mock("../../hooks/use-captcha-config", () => ({
  useGetCaptchaConfigs: () => ({ isLoading: false, isFetching: false, data: captchaData }),
  useSaveCaptcha: () => ({ mutateAsync, isPending: false }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

vi.mock("./configure-general-captcha-from-field", () => ({
  ConfigureGeneralCaptchaFormField: () => <div data-testid="general-fields" />,
}));
vi.mock("./configure-block-captcha-form-field", () => ({
  ConfigureBlockCaptchaFormField: () => <div data-testid="block-fields" />,
}));

import { ConfigureCaptchaModal } from "./configure-captcha-modal";

const renderModal = (configuration?: Record<string, unknown> | null) =>
  render(
    <ConfigureCaptchaModal configuration={configuration as never}>
      <DialogTrigger>Open</DialogTrigger>
    </ConfigureCaptchaModal>,
  );

const editConfig = {
  provider: "recaptcha",
  captchaKey: "site-key",
  captchaSecret: "secret",
  captchaGenerator: "EasyCaptchaGenerator",
  isEnable: true,
};

beforeEach(() => {
  captchaData = { configurations: [] };
  // jsdom lacks the Pointer Capture APIs that Radix Select calls on open.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => vi.clearAllMocks());

describe("ConfigureCaptchaModal", () => {
  it("opens the add-configuration dialog from the trigger", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Add Captcha Configuration")).toBeInTheDocument();
    expect(screen.getByTestId("general-fields")).toBeInTheDocument();
    expect(screen.getByTestId("block-fields")).toBeInTheDocument();
  });

  it("shows the edit title for an existing configuration", async () => {
    const user = userEvent.setup();
    renderModal(editConfig);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText(/Edit Google reCAPTCHA/)).toBeInTheDocument();
  });

  it("lists all unconfigured providers in add mode", async () => {
    const user = userEvent.setup();
    captchaData = { configurations: [{ provider: "recaptcha" }] };
    renderModal();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("combobox"));
    // recaptcha is already configured, so only hCAPTCHA remains selectable.
    expect((await screen.findAllByText("hCAPTCHA")).length).toBeGreaterThan(0);
  });

  it("keeps the Save button disabled until the form is dirty", async () => {
    const user = userEvent.setup();
    renderModal(editConfig);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
  });
});
