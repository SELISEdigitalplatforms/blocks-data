import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/authentication-config", () => ({
  AuthenticationConfig: () => <div>authentication-config-child</div>,
}));

import AuthenticationConfigPage from "./authentication-config";

describe("dashboard/authentication-config AuthenticationConfigPage", () => {
  it("renders its AuthenticationConfig child", () => {
    render(<AuthenticationConfigPage />);
    expect(screen.getByText("authentication-config-child")).toBeInTheDocument();
  });
});
