import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/mode-toggle/mode-toggle", () => ({
  ModeToggle: () => <div data-testid="mode-toggle" />,
}));

import { BlocksLoginPage } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

  it("paints the atmospheric canvas gradient on mount", () => {
    const gradient = { addColorStop: vi.fn() };
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    // Run the animation frame exactly once so draw() executes without looping.
    let frames = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (frames++ < 1) cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    render(<BlocksLoginPage name="blocks-iam" onLogin={vi.fn()} />);

    expect(ctx.setTransform).toHaveBeenCalled();
    expect(ctx.createRadialGradient).toHaveBeenCalled();
    expect(gradient.addColorStop).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("rotates to the next animated keyword on the interval", () => {
    vi.useFakeTimers();
    render(
      <BlocksLoginPage
        name="blocks-iam"
        onLogin={vi.fn()}
        keywords={["alpha", "beta"]}
      />,
    );
    expect(screen.getByText("alpha")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2800);
      vi.advanceTimersByTime(280);
    });
    expect(screen.getByText("beta")).toBeInTheDocument();
  });
});
