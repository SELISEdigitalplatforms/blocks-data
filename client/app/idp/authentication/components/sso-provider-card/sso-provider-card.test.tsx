import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

let theme = "light";
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ theme }) }));

vi.mock("../sso-provider-status-toggle", () => ({
  SSoProviderStatusToggle: ({ open }: { open: boolean }) => (
    <div data-testid="toggle">{open ? "open" : "closed"}</div>
  ),
}));

import { SSOProviderCard, SSOProviderCardSkelton } from "./sso-provider-card";

const baseConfig = {
  label: "Google",
  provider: "google",
  itemId: "id-1",
  isAvailable: true,
  isDisabled: false,
  description: "Sign in with Google",
  imageSrc: "light.png",
  imageSrcDark: "dark.png",
};

const renderCard = (config = {}) =>
  render(
    <MemoryRouter>
      <SSOProviderCard configuration={{ ...baseConfig, ...config } as never} />
    </MemoryRouter>,
  );

beforeEach(() => {
  theme = "light";
});
afterEach(() => vi.clearAllMocks());

describe("SSOProviderCard", () => {
  it("renders label, description and the Active badge for a configured available provider", () => {
    renderCard();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows a Coming soon badge for an unavailable provider", () => {
    renderCard({ isAvailable: false });
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("uses the dark image source when the theme is dark", () => {
    theme = "dark";
    renderCard();
    expect(screen.getByAltText("socical_icon")).toHaveAttribute("src", "dark.png");
  });

  it("opens the status toggle from the dropdown Disable action", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Disable"));
    expect(screen.getByTestId("toggle")).toHaveTextContent("open");
  });

  it("renders the skeleton placeholder", () => {
    const { container } = render(<SSOProviderCardSkelton />);
    expect(container.querySelectorAll("[class*='w-']").length).toBeGreaterThan(0);
  });
});
