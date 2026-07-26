import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateField } from "@/data-gateway/models/schema-preview.types";

import { FilterPopover } from "./filter-popover";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const fields: TemplateField[] = [
  { name: "title", type: "string" },
  { name: "count", type: "int" },
  { name: "active", type: "boolean" },
  { name: "tags", type: "string", isArray: true },
  { name: "createdAt", type: "datetime" },
];

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Filter"));
}

// Selects the field then operator in the first condition row.
async function pickFieldAndOperator(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  operator: string,
) {
  const combos = screen.getAllByRole("combobox");
  await user.click(combos[0]); // field select
  await user.click(await screen.findByRole("option", { name: field }));
  const combosAfter = screen.getAllByRole("combobox");
  await user.click(combosAfter[1]); // operator select
  await user.click(await screen.findByRole("option", { name: operator }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FilterPopover", () => {
  it("renders the trigger, inactive when no filter applied", () => {
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    const trigger = screen.getByTitle("Filter");
    expect(trigger).toHaveClass("text-muted-foreground");
  });

  it("marks the trigger active when a filter is applied", () => {
    render(<FilterPopover fields={fields} appliedFilter={'{"a":1}'} onApply={vi.fn()} />);
    expect(screen.getByTitle("Filter")).toHaveClass("text-primary");
  });

  it("builds an equals filter for a string field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "hello");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ title: "hello" }));
  });

  it("builds a contains regex filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "contains");
    await user.type(screen.getByPlaceholderText("Value"), "abc");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $regex: "abc", $options: "i" } }),
    );
  });

  it("builds an $in filter for is one of on a string field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "is one of");
    await user.type(screen.getByPlaceholderText("a, b, c"), "a, b, c");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $in: ["a", "b", "c"] } }),
    );
  });

  it("builds a greater than filter for a number field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "count", "greater than");
    await user.type(screen.getByPlaceholderText("Value"), "5");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ count: { $gt: 5 } }));
  });

  it("builds a boolean is true filter with no value input", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "active", "is true");
    // No value input for is true.
    expect(screen.queryByPlaceholderText("Value")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ active: true }));
  });

  it("builds an is empty ($exists false) filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "tags", "is empty");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ tags: { $exists: false } }),
    );
  });

  it("builds an array does not contain filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "tags", "does not contain");
    await user.type(screen.getByPlaceholderText("Value"), "x");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ tags: { $not: { $regex: "x", $options: "i" } } }),
    );
  });

  it("combines multiple conditions with the OR logic toggle", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "a");
    // Add a second condition.
    await user.click(screen.getByRole("button", { name: /Add condition/ }));
    const rows = screen.getAllByRole("combobox");
    // rows: [field1, op1, field2, op2] -> configure field2/op2.
    await user.click(rows[2]);
    await user.click(await screen.findByRole("option", { name: "count" }));
    const rows2 = screen.getAllByRole("combobox");
    await user.click(rows2[3]);
    await user.click(await screen.findByRole("option", { name: "equals" }));
    const values = screen.getAllByPlaceholderText("Value");
    await user.type(values[1], "2");
    // Switch to OR.
    await user.click(screen.getByRole("button", { name: "OR" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ $or: [{ title: "a" }, { count: 2 }] }),
    );
  });

  it("shows the date picker trigger for a date field equals operator", async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "createdAt", "equals");
    // Date-typed value input renders the "Pick a date" trigger, not a text box.
    expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Value")).not.toBeInTheDocument();
  });

  it("clears the filter and calls onApply with empty string", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter={'{"title":"a"}'} onApply={onApply} />);
    await openPopover(user);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onApply).toHaveBeenCalledWith("");
  });

  it("removes a condition via its remove button, keeping at least one row", async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    await openPopover(user);
    const remove = screen.getByTitle("Remove condition");
    await user.click(remove);
    // Still at least one field selector present.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
  });

  it("applies an empty string when no valid condition is present", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    // No field/operator chosen -> buildFilterString yields "".
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith("");
  });

  it("reopening after apply restores the saved draft", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(
      <FilterPopover fields={fields} appliedFilter="" onApply={onApply} />,
    );
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "keep");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // Simulate the parent reflecting the applied filter and reopen.
    rerender(<FilterPopover fields={fields} appliedFilter={'{"title":"keep"}'} onApply={onApply} />);
    await openPopover(user);
    expect(screen.getByDisplayValue("keep")).toBeInTheDocument();
  });
});
