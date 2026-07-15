import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectionPopover } from "./projection-popover";

const fieldNames = ["id", "name", "email"];

describe("ProjectionPopover", () => {
  it("lists all fields when opened", async () => {
    const user = userEvent.setup();
    render(
      <ProjectionPopover fieldNames={fieldNames} appliedFields={[]} onApply={vi.fn()} />,
    );

    await user.click(screen.getByTitle("Column"));
    fieldNames.forEach((f) => expect(screen.getByText(f)).toBeInTheDocument());
    // All selected by default (no applied fields) => "Deselect all"
    expect(screen.getByText("Deselect all")).toBeInTheDocument();
  });

  it("applies [] when all fields remain selected (show all)", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProjectionPopover fieldNames={fieldNames} appliedFields={[]} onApply={onApply} />,
    );

    await user.click(screen.getByTitle("Column"));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it("deselects all then applies an empty projection selection", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ProjectionPopover fieldNames={fieldNames} appliedFields={[]} onApply={onApply} />,
    );

    await user.click(screen.getByTitle("Column"));
    await user.click(screen.getByText("Deselect all"));
    // Now nothing selected -> "Select all" is shown
    expect(screen.getByText("Select all")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // 0 selected !== fieldNames.length, so the empty selection is passed through
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it("highlights the trigger when a projection is applied", () => {
    render(
      <ProjectionPopover
        fieldNames={fieldNames}
        appliedFields={["id"]}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Column")).toHaveClass("text-primary");
  });
});
