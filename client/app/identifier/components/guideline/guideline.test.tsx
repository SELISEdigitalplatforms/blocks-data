import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideLine } from "./guideline";

const steps = [
  { id: "1", description: "Step one" },
  { id: "2", description: "Step two" },
  { id: "3", description: "Step three" },
];

afterEach(() => vi.clearAllMocks());

describe("GuideLine", () => {
  it("shows the first step with the previous button disabled", () => {
    render(<GuideLine steps={steps} />);
    expect(screen.getByText("Step one")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("navigates forward and backward through the steps", async () => {
    const user = userEvent.setup();
    render(<GuideLine steps={steps} />);
    const [prev, next] = screen.getAllByRole("button");
    await user.click(next);
    expect(screen.getByText("Step two")).toBeInTheDocument();
    await user.click(next);
    expect(screen.getByText("Step three")).toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.click(prev);
    expect(screen.getByText("Step two")).toBeInTheDocument();
  });

  it("shows full progress for a single-step guide with next disabled", () => {
    render(<GuideLine steps={[{ id: "1", description: "Only" }]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText("Only")).toBeInTheDocument();
  });
});
