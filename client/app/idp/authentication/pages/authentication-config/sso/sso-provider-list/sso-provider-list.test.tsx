import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetAuthConfig = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-auth-config", () => ({
  useGetAuthConfig: (...a: unknown[]) => useGetAuthConfig(...a),
}));

const useGetSsoCredentials = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-sso", () => ({
  useGetSsoCredentials: (...a: unknown[]) => useGetSsoCredentials(...a),
}));

vi.mock("@blocks-idp/authentication/components/sso-provider-card/sso-provider-card", () => ({
  SSOProviderCard: ({ configuration }: { configuration: { provider: string } }) => (
    <div data-testid="provider-card">{configuration.provider}</div>
  ),
  SSOProviderCardSkelton: () => <div data-testid="provider-skeleton" />,
}));

import { SSOProviderList } from "./sso-provider-list";

afterEach(() => vi.clearAllMocks());

describe("SSOProviderList", () => {
  it("renders skeletons while the auth config loads", () => {
    useGetAuthConfig.mockReturnValue({ isLoading: true });
    useGetSsoCredentials.mockReturnValue({ data: undefined });
    render(<SSOProviderList />);
    expect(screen.getAllByTestId("provider-skeleton").length).toBe(6);
    expect(screen.queryByTestId("provider-card")).not.toBeInTheDocument();
  });

  it("renders a card for every known provider merged with configured credentials", () => {
    useGetAuthConfig.mockReturnValue({ isLoading: false });
    useGetSsoCredentials.mockReturnValue({
      data: [{ provider: "google", itemId: "cfg-google" }],
    });
    render(<SSOProviderList />);
    const cards = screen.getAllByTestId("provider-card");
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.some((c) => c.textContent === "google")).toBe(true);
  });
});
