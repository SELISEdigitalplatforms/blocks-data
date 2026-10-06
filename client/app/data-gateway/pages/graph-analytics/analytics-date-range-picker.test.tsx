import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isSameDay, startOfDay, subDays } from "date-fns";

import {
  AnalyticsDateRange,
  AnalyticsDateRangePicker,
  matchPreset,
} from "./analytics-date-range-picker";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const today = startOfDay(new Date());
const lastWeek: AnalyticsDateRange = { from: subDays(today, 6), to: today };

// react-day-picker names each day button by its day-of-month number.
const dayButton = (day: number) =>
  screen.getAllByRole("gridcell", { name: String(day) }).find((cell) => !cell.hasAttribute("disabled"))!;

describe("AnalyticsDateRangePicker", () => {
  it("names the applied preset on the trigger", () => {
    render(<AnalyticsDateRangePicker value={lastWeek} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Date range/ })).toHaveTextContent("Last 7 days");
  });

  it("starts a fresh range on the first click and applies only on Apply", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsDateRangePicker value={lastWeek} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Date range/ }));
    // The first enabled "1" and "2" are the start of the left-hand month, always in the past.
    await user.click(dayButton(1));
    expect(screen.getByText(/pick an end date/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(dayButton(2));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0][0] as AnalyticsDateRange;
    expect(range.from.getDate()).toBe(1);
    expect(range.to.getDate()).toBe(2);
    expect(range.to.getMonth()).toBe(range.from.getMonth());
  });

  it("treats a single picked day as a one-day range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsDateRangePicker value={lastWeek} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Date range/ }));
    await user.click(dayButton(1));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    const range = onChange.mock.calls[0][0] as AnalyticsDateRange;
    expect(isSameDay(range.from, range.to)).toBe(true);
  });

  it("discards an edit on Cancel", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AnalyticsDateRangePicker value={lastWeek} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Date range/ }));
    await user.click(dayButton(1));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("matches presets by calendar day", () => {
    expect(matchPreset(lastWeek, today)?.label).toBe("Last 7 days");
    expect(matchPreset({ from: subDays(today, 3), to: today }, today)).toBeUndefined();
  });
});
