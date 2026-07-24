import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/mfa/pages/configure-mfa/configure-mfa", () => ({
  ConfigureMFA: () => <div>mfa-config-child</div>,
}));

import MfaConfigPage from "./mfa-config";

describe("dashboard/mfa-config MfaConfigPage", () => {
  it("renders its ConfigureMFA child", () => {
    render(<MfaConfigPage />);
    expect(screen.getByText("mfa-config-child")).toBeInTheDocument();
  });
});
