import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let certResult: Record<string, unknown>;
let jwtResult: Record<string, unknown>;
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-identifier", () => ({
  useGetSavedPublicCertificates: () => certResult,
}));
vi.mock("@blocks-idp/authentication/hooks/use-jwt-claim", () => ({
  useGetJwtClaim: () => jwtResult,
}));
vi.mock("./empty-configuration", () => ({
  EmptyConfiguration: () => <div data-testid="empty" />,
}));
vi.mock("./add-edit-provider-modal", () => ({
  AddEditProviderModal: () => <div data-testid="add-edit" />,
}));
vi.mock("./map-jwt-claim-modal", () => ({
  default: ({ open }: { open: boolean }) => <div data-testid="jwt-modal">{open ? "open" : "closed"}</div>,
}));

import { Certificates } from "./certificates";

beforeEach(() => {
  certResult = { isLoading: false, data: { isConfigured: true, providerName: "Okta", jwksUrl: "https://jwks", issuer: "iss", audiences: ["aud1", "aud2"] } };
  jwtResult = { data: { itemId: "claim-1" }, isLoading: false };
});
afterEach(() => vi.clearAllMocks());

describe("Certificates", () => {
  it("shows a skeleton while loading", () => {
    certResult = { isLoading: true, data: undefined };
    const { container } = render(<Certificates />);
    expect(container.querySelectorAll(".animate-pulse, [class*='skeleton']").length).toBeGreaterThan(0);
  });

  it("shows the empty configuration when not configured", () => {
    certResult = { isLoading: false, data: { isConfigured: false } };
    render(<Certificates />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("renders provider details when configured", () => {
    render(<Certificates />);
    expect(screen.getByText("External IdP")).toBeInTheDocument();
    expect(screen.getByText("Okta")).toBeInTheDocument();
    expect(screen.getByText("https://jwks")).toBeInTheDocument();
    expect(screen.getByText("aud1, aud2")).toBeInTheDocument();
    expect(screen.getByTestId("add-edit")).toBeInTheDocument();
  });

  it("shows the map-claims warning when no jwt claim exists", () => {
    jwtResult = { data: { itemId: "" }, isLoading: false };
    render(<Certificates />);
    expect(screen.getByText(/didn't map the jwt claims/i)).toBeInTheDocument();
  });

  it("opens the JWT claim modal when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<Certificates />);
    expect(screen.getByTestId("jwt-modal")).toHaveTextContent("closed");
    await user.click(screen.getByRole("button", { name: /Map JWT Claim/i }));
    expect(screen.getByTestId("jwt-modal")).toHaveTextContent("open");
  });

  it("renders a dash for missing url, issuer and audiences", () => {
    certResult = { isLoading: false, data: { isConfigured: true, providerName: "others", audiences: [] } };
    render(<Certificates />);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });
});
