import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modals/configure-captcha-modal/", () => ({
  ConfigureCaptchaModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@blocks-idp/captcha/modals/toggle-captcha-status-modal", () => ({
  ToggleCaptchaStatusModal: () => <div data-testid="toggle" />,
}));
vi.mock("@/components/copy-to-clipboard-button", () => ({
  CopyToClipboardButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/masked-text", () => ({
  MaskedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("@/components/ui-kits/dialog/dialog", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

import { ConfigureCaptchaList } from "./configure-captcha-list";

const config = {
  itemId: "c1",
  provider: "recaptcha" as const,
  isEnable: true,
  captchaKey: "site-key",
  captchaSecret: "secret-key",
};

afterEach(() => vi.clearAllMocks());

describe("ConfigureCaptchaList", () => {
  it("shows the loading skeleton", () => {
    const { container } = render(<ConfigureCaptchaList isLoading configurations={[]} />);
    expect(container.querySelector(".grid")).toBeInTheDocument();
    expect(screen.queryByText(/No configurations/)).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no configurations", () => {
    render(<ConfigureCaptchaList isLoading={false} configurations={[]} />);
    expect(screen.getByText(/No configurations found/)).toBeInTheDocument();
  });

  it("renders a configuration card with the provider label and enabled badge", () => {
    render(<ConfigureCaptchaList isLoading={false} configurations={[config] as never} />);
    expect(screen.getByText(/Google reCAPTCHA/)).toBeInTheDocument();
    expect(screen.getByText("Enable")).toBeInTheDocument();
    expect(screen.getAllByTestId("toggle").length).toBeGreaterThan(0);
  });

  it("does not render a card for an unknown provider", () => {
    render(
      <ConfigureCaptchaList
        isLoading={false}
        configurations={[{ ...config, provider: "unknown" }] as never}
      />,
    );
    expect(screen.queryByText(/Google reCAPTCHA/)).not.toBeInTheDocument();
  });
});
