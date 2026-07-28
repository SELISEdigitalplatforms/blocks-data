import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortPopover } from "./sort-popover";

const fieldNames = ["name", "createdAt"];

describe("SortPopover", () => {
  it("shows the applied field chip and clears it", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <SortPopover
        fieldNames={fieldNames}
        appliedSortField="name"
        appliedSortDirection="asc"
        onApply={vi.fn()}
        onClear={onClear}
      />,
    );

    // The applied-field chip is rendered outside the popover
    expect(screen.getByText("name")).toBeInTheDocument();

    // The chip's X button (rendered inside the chip span) clears the sort
    const clearBtn = screen.getByText("name").querySelector("button")!;
    await user.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("opens the popover and applies the drafted field + direction", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <SortPopover
        fieldNames={fieldNames}
        appliedSortField=""
        appliedSortDirection="asc"
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle("Sort"));
    // Field radios rendered inside the popover
    await user.click(screen.getByText("createdAt"));
    await user.click(screen.getByRole("button", { name: "Descending" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith("createdAt", "desc");
  });
});
