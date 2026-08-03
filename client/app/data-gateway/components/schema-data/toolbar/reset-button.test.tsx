import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResetButton } from "./reset-button";

describe("ResetButton", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(
      <ResetButton isActive={false} onReset={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the reset control when active", () => {
    render(<ResetButton isActive onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("invokes onReset when clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetButton isActive onReset={onReset} />);

    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
