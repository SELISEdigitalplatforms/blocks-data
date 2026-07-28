import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("../hooks/use-captcha-config", () => ({
  useToggleCaptchaConfigStatus: () => ({ isPending, mutateAsync }),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { ToggleCaptchaStatusModal } from "./toggle-captcha-status-modal";

const enabledConfig = {
  itemId: "c1",
  provider: "recaptcha",
  isEnable: true,
} as never;

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("ToggleCaptchaStatusModal", () => {
  it("shows a Disable trigger for an enabled config and opens the dialog", async () => {
    const user = userEvent.setup();
    render(<ToggleCaptchaStatusModal configuration={enabledConfig} />);
    const trigger = screen.getAllByRole("button", { name: /Disable/ })[0];
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByText("Disable CAPTCHA?")).toBeInTheDocument();
    expect(screen.getByText(/Google reCAPTCHA/)).toBeInTheDocument();
  });

  it("toggles the config off and shows success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<ToggleCaptchaStatusModal configuration={enabledConfig} />);
    await user.click(screen.getAllByRole("button", { name: /Disable/ })[0]);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-1",
        isEnable: false,
        itemId: "c1",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the toggle fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { x: "bad" } });
    render(
      <ToggleCaptchaStatusModal
        configuration={{ itemId: "c2", provider: "hcaptcha", isEnable: false } as never}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /Enable/ })[0]);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { x: "bad" } }));
  });
});
