import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DateRange } from "react-day-picker";

vi.mock("@/hooks/use-is-mobile", () => ({ default: () => false }));

let calendarOnSelect: ((range: DateRange | undefined) => void) | undefined;
vi.mock("@/components/ui-kits/calendar/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (r: DateRange | undefined) => void }) => {
    calendarOnSelect = onSelect;
    return <div data-testid="calendar" />;
  },
}));

import { DateRangeFilter } from "./date-range-filter";

afterEach(() => {
  vi.clearAllMocks();
  calendarOnSelect = undefined;
});

describe("DateRangeFilter", () => {
  it("renders the title and the selected range summary", () => {
    render(
      <DateRangeFilter
        title="Created"
        date={{ from: new Date("2026-01-01"), to: new Date("2026-01-31") }}
        onDateChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("sets the column filter when a full range is picked", () => {
    const onDateChange = vi.fn();
    const setFilterValue = vi.fn();
    render(
      <DateRangeFilter
        title="Created"
        date={undefined}
        onDateChange={onDateChange}
        column={{ setFilterValue } as never}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const range = { from: new Date("2026-01-01"), to: new Date("2026-01-31") };
    calendarOnSelect?.(range);
    expect(onDateChange).toHaveBeenCalledWith(range);
    expect(setFilterValue).toHaveBeenCalledWith(range);
  });

  it("clears the column filter when the range is incomplete", () => {
    const onDateChange = vi.fn();
    const setFilterValue = vi.fn();
    render(
      <DateRangeFilter
        title="Created"
        date={undefined}
        onDateChange={onDateChange}
        column={{ setFilterValue } as never}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    calendarOnSelect?.({ from: new Date("2026-01-01"), to: undefined });
    expect(setFilterValue).toHaveBeenCalledWith(undefined);
  });
});
