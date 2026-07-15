import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearButton } from "./clear-button";

describe("ClearButton", () => {
  it("renders a Clear label", () => {
    render(<ClearButton onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("invokes onClear when pressed", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<ClearButton onClear={onClear} />);
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
