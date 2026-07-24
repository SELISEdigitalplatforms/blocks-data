import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const useGetMFAConfig = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGetMFAConfig: (...a: unknown[]) => useGetMFAConfig(...a),
}));

vi.mock("./profile-mfa-detail", () => ({ ProfileMFADetails: () => <div data-testid="details" /> }));
vi.mock("./user-mfa-confirmation/profile-mfa-methods-select-list", () => ({
  ProfileMfaMethodSelectList: () => <div data-testid="method-select" />,
}));

import { ProfileMFA } from "./profile-mfa";

const renderMfa = () =>
  render(
    <MemoryRouter>
      <ProfileMFA userId="u1" projectKey="pk" />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("ProfileMFA", () => {
  it("renders a loading skeleton while the config loads", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: true, data: undefined });
    renderMfa();
    expect(screen.queryByTestId("details")).not.toBeInTheDocument();
  });

  it("prompts to enable MFA at the project level when disabled", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: false } });
    renderMfa();
    expect(screen.getByRole("link", { name: "Go to MFA Settings" })).toBeInTheDocument();
  });

  it("renders the profile config and method select when MFA is enabled", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: true } });
    renderMfa();
    expect(screen.getByTestId("details")).toBeInTheDocument();
    expect(screen.getByTestId("method-select")).toBeInTheDocument();
  });
});
