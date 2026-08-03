import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetButton } from "./reset-button";

describe("ResetButton", () => {
  it("renders a Reset label", () => {
    render(<ResetButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("invokes onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ResetButton onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
