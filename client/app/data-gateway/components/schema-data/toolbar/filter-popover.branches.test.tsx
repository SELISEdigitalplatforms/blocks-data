import { render, screen } from "@testing-library/react";
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

async function pickFieldAndOperator(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  operator: string,
) {
  const combos = screen.getAllByRole("combobox");
  await user.click(combos[0]);
  await user.click(await screen.findByRole("option", { name: field }));
  const combosAfter = screen.getAllByRole("combobox");
  await user.click(combosAfter[1]);
  await user.click(await screen.findByRole("option", { name: operator }));
}

// Selects the first selectable day button in the open calendar. react-day-picker
// marks day buttons with role="gridcell", so query the elements directly.
async function pickACalendarDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Pick a date" }));
  const grid = await screen.findByRole("grid");
  const dayButton = grid.querySelector<HTMLButtonElement>(
    'button[name="day"]:not([disabled])',
  );
  await user.click(dayButton as HTMLElement);
}

async function apply(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Apply" }));
}

function setup() {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
  return { user, onApply };
}

describe("FilterPopover - operator branch coverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("not equals on a string field", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "not equals");
    await user.type(screen.getByPlaceholderText("Value"), "x");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ title: { $ne: "x" } }));
  });

  it("is not one of on a string field maps to $nin", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "is not one of");
    await user.type(screen.getByPlaceholderText("a, b, c"), "a, b");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ title: { $nin: ["a", "b"] } }));
  });

  it("starts with builds an anchored regex", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "starts with");
    await user.type(screen.getByPlaceholderText("Value"), "ab");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $regex: "^ab", $options: "i" } }),
    );
  });

  it("ends with builds an end-anchored regex", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "ends with");
    await user.type(screen.getByPlaceholderText("Value"), "yz");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $regex: "yz$", $options: "i" } }),
    );
  });

  it("greater than or equal on a number field", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "count", "greater than or equal");
    await user.type(screen.getByPlaceholderText("Value"), "3");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ count: { $gte: 3 } }));
  });

  it("less than on a number field", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "count", "less than");
    await user.type(screen.getByPlaceholderText("Value"), "9");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ count: { $lt: 9 } }));
  });

  it("less than or equal on a number field", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "count", "less than or equal");
    await user.type(screen.getByPlaceholderText("Value"), "8");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ count: { $lte: 8 } }));
  });

  it("is false on a boolean field", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "active", "is false");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ active: false }));
  });

  it("is not empty maps to $exists true", async () => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "tags", "is not empty");
    await apply(user);
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ tags: { $exists: true } }));
  });
});

describe("FilterPopover - date operator branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["equals", /^\{"createdAt":ISODate\("/],
    ["not equals", /\$ne":ISODate\("/],
    ["before", /\$lt":ISODate\("/],
    ["after", /\$gt":ISODate\("/],
    ["on or before", /\$lte":ISODate\("/],
    ["on or after", /\$gte":ISODate\("/],
  ])("date operator %s emits an ISODate fragment", async (operator, pattern) => {
    const { user, onApply } = setup();
    await openPopover(user);
    await pickFieldAndOperator(user, "createdAt", operator);
    await pickACalendarDay(user);
    await apply(user);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatch(pattern);
  });
});

describe("FilterPopover - AND/OR logic toggle", () => {
  it("toggles the multi-rule logic between OR and AND", async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    await openPopover(user);
    // A second condition reveals the AND/OR relation toggle.
    await user.click(screen.getByRole("button", { name: /Add condition/ }));
    const orBtn = screen.getByRole("button", { name: "OR" });
    const andBtn = screen.getByRole("button", { name: "AND" });
    await user.click(orBtn);
    expect(orBtn.className).toMatch(/bg-primary/);
    await user.click(andBtn);
    expect(andBtn.className).toMatch(/bg-primary/);
  });
});
