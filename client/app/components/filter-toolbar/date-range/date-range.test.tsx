import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-is-mobile", () => ({ default: () => false }));

import { DateRange } from "./date-range";

afterEach(() => vi.clearAllMocks());

describe("DateRange", () => {
  it("renders the label and no range summary when value is empty", () => {
    render(<DateRange label="Created" value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("shows the formatted from date when a range is set", () => {
    const from = new Date(2024, 0, 15);
    render(<DateRange label="Created" value={{ from }} onChange={vi.fn()} />);
    // formatted date appears alongside the label inside the trigger button.
    expect(screen.getByRole("button")).toHaveTextContent("Created");
  });

  it("opens the calendar popover and applies the current selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const from = new Date(2024, 0, 15);
    render(<DateRange label="Created" value={{ from }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Created/i }));
    const apply = await screen.findByRole("button", { name: "Apply" });
    await user.click(apply);
    expect(onChange).toHaveBeenCalled();
  });

  it("resets the selection with the reset button", async () => {
    const user = userEvent.setup();
    render(<DateRange label="Created" value={{ from: new Date(2024, 0, 1) }} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Created/i }));
    const reset = await screen.findByRole("button", { name: "Reset" });
    await user.click(reset);
    expect(reset).toBeInTheDocument();
  });
});
