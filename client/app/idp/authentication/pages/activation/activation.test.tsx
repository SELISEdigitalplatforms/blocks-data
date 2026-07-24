import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activationCodeValidation = vi.fn();
const resendActivationLink = vi.fn();
let isResendPending = false;

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "blocks-key" }));
vi.mock("@/components/logo", () => ({ Logo: () => <div data-testid="logo" /> }));
vi.mock("./activation-form", () => ({ ActivationForm: () => <div data-testid="activation-form" /> }));
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountActivationCodeExpiration: () => ({
    isPending: false,
    mutateAsync: activationCodeValidation,
  }),
  useAccountResendActivation: () => ({ mutateAsync: resendActivationLink, isPending: isResendPending }),
}));

import { Activation } from "./activation";

const renderComp = (code?: string) =>
  render(
    <MemoryRouter>
      <Activation code={code} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isResendPending = false;
});

describe("Activation", () => {
  it("shows the invalid state when no code is provided", async () => {
    renderComp(undefined);
    expect(await screen.findByText("Invalid Activation Link")).toBeInTheDocument();
  });

  it("renders the activation form when the code is valid", async () => {
    activationCodeValidation.mockResolvedValue({ isSuccess: true, errors: null, userId: null });
    renderComp("good-code");
    expect(await screen.findByTestId("activation-form")).toBeInTheDocument();
  });

  it("shows the invalid state when the API returns errors", async () => {
    activationCodeValidation.mockResolvedValue({ isSuccess: false, errors: ["bad"], userId: null });
    renderComp("bad-code");
    expect(await screen.findByText("Invalid Activation Link")).toBeInTheDocument();
  });

  it("shows the expired state and resends the activation link", async () => {
    activationCodeValidation.mockResolvedValue({ isSuccess: true, errors: null, userId: "user-9" });
    resendActivationLink.mockResolvedValue({ isSuccess: true });
    const user = userEvent.setup();
    renderComp("expired-code");

    expect(await screen.findByText("Activation Link Expired")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resend activation link" }));
    expect(resendActivationLink).toHaveBeenCalledWith({ userId: "user-9", projectKey: "blocks-key" });
    expect(
      await screen.findByText("A new activation link has been sent to your email."),
    ).toBeInTheDocument();
  });

  it("shows a failure message when resending fails", async () => {
    activationCodeValidation.mockResolvedValue({ isSuccess: true, errors: null, userId: "user-9" });
    resendActivationLink.mockResolvedValue({ isSuccess: false });
    const user = userEvent.setup();
    renderComp("expired-code");
    await screen.findByText("Activation Link Expired");
    await user.click(screen.getByRole("button", { name: "Resend activation link" }));
    expect(
      await screen.findByText("Failed to resend activation link. Please try again later."),
    ).toBeInTheDocument();
  });

  it("falls back to the invalid state when validation throws", async () => {
    activationCodeValidation.mockRejectedValue(new Error("network"));
    renderComp("boom");
    expect(await screen.findByText("Invalid Activation Link")).toBeInTheDocument();
  });
});
