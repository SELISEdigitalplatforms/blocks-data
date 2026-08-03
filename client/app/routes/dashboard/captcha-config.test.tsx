import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/captcha/pages/configure-captcha", () => ({
  ConfigureCaptcha: () => <div>captcha-config-child</div>,
}));

import CaptchaConfigPage from "./captcha-config";

describe("dashboard/captcha-config CaptchaConfigPage", () => {
  it("renders its ConfigureCaptcha child", () => {
    render(<CaptchaConfigPage />);
    expect(screen.getByText("captcha-config-child")).toBeInTheDocument();
  });
});
