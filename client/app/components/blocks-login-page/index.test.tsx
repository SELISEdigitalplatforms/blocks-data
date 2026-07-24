import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mode-toggle/mode-toggle", () => ({
  ModeToggle: () => <div data-testid="mode-toggle" />,
}));

import { BlocksLoginPage } from "./index";

describe("BlocksLoginPage", () => {
  it("renders the hero, docs links and login button for a known product", () => {
    render(<BlocksLoginPage name="blocks-iam" onLogin={vi.fn()} />);
    // Default eyebrow and login label.
    expect(screen.getByText("Enterprise Application OS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in to your account" })).toBeInTheDocument();
    // The nav mode-toggle is composed in.
    expect(screen.getByTestId("mode-toggle")).toBeInTheDocument();
    // Other products render as carousel cards (duplicated for the marquee).
    expect(screen.getByText(/services$/)).toBeInTheDocument();
  });

  it("invokes onLogin when the login button is clicked", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<BlocksLoginPage name="blocks-iam" onLogin={onLogin} loginLabel="Sign in" />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onLogin).toHaveBeenCalled();
  });

  it("shows the redirecting state and disables the button when loading", () => {
    render(<BlocksLoginPage name="blocks-iam" onLogin={vi.fn()} isLoading />);
    const btn = screen.getByRole("button", { name: "Redirecting…" });
    expect(btn).toBeDisabled();
  });

  it("falls back to the first product for an unknown name", () => {
    render(<BlocksLoginPage name="does-not-exist" onLogin={vi.fn()} eyebrow="Custom eyebrow" />);
    expect(screen.getByText("Custom eyebrow")).toBeInTheDocument();
  });

  it("renders the initial animated keyword", () => {
    render(
      <BlocksLoginPage
        name="blocks-iam"
        onLogin={vi.fn()}
        keywords={["first", "second"]}
        keywordPrefix="Backends that are"
      />,
    );
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText(/Backends that are/)).toBeInTheDocument();
  });
});
