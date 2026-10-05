import { useState } from "react";
import {
  addMonths,
  endOfMonth,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui-kits/button/button";
import { Calendar } from "@/components/ui-kits/calendar/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import useIsMobile from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { formatCalendarDate } from "./graph-log-formatters";

/** A complete, calendar-day range: both ends are local midnights. */
export type AnalyticsDateRange = { from: Date; to: Date };

type Preset = { label: string; range: (today: Date) => AnalyticsDateRange };

export const DATE_RANGE_PRESETS: Preset[] = [
  { label: "Today", range: (today) => ({ from: today, to: today }) },
  { label: "Yesterday", range: (today) => ({ from: subDays(today, 1), to: subDays(today, 1) }) },
  { label: "Last 7 days", range: (today) => ({ from: subDays(today, 6), to: today }) },
  { label: "Last 30 days", range: (today) => ({ from: subDays(today, 29), to: today }) },
  { label: "Last 90 days", range: (today) => ({ from: subDays(today, 89), to: today }) },
  { label: "This month", range: (today) => ({ from: startOfMonth(today), to: today }) },
  {
    label: "Last month",
    range: (today) => {
      const lastMonth = subMonths(today, 1);
      return { from: startOfMonth(lastMonth), to: startOfDay(endOfMonth(lastMonth)) };
    },
  },
];

const YEARS_BACK = 5;
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Date(2000, month, 1).toLocaleString(undefined, { month: "long" }),
);

const sameRange = (a: AnalyticsDateRange, b: AnalyticsDateRange) =>
  isSameDay(a.from, b.from) && isSameDay(a.to, b.to);

export const matchPreset = (range: AnalyticsDateRange, today = startOfDay(new Date())) =>
  DATE_RANGE_PRESETS.find((preset) => sameRange(preset.range(today), range));

export const formatRangeLabel = ({ from, to }: AnalyticsDateRange) =>
  isSameDay(from, to) ? formatCalendarDate(from) : `${formatCalendarDate(from)} – ${formatCalendarDate(to)}`;

interface AnalyticsDateRangePickerProps {
  value: AnalyticsDateRange;
  // eslint-disable-next-line no-unused-vars
  onChange: (range: AnalyticsDateRange) => void;
}

/**
 * Presets for the common windows, and a calendar for any other. Unlike the shared table filter,
 * nothing is applied until the range is complete and confirmed, and the first click on the
 * calendar always starts a new range rather than nudging the nearest end of the old one.
 */
export function AnalyticsDateRangePicker({ value, onChange }: AnalyticsDateRangePickerProps) {
  const isMobile = useIsMobile();
  const numberOfMonths = isMobile ? 1 : 2;
  const today = startOfDay(new Date());
  // The left-most month that still keeps every visible month on or before this one.
  const lastLeftMonth = startOfMonth(subMonths(today, numberOfMonths - 1));
  const firstMonth = startOfMonth(new Date(today.getFullYear() - YEARS_BACK, 0, 1));
  const clampMonth = (month: Date) =>
    isAfter(month, lastLeftMonth) ? lastLeftMonth : isBefore(month, firstMonth) ? firstMonth : month;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const [month, setMonth] = useState(() => clampMonth(startOfMonth(value.from)));

  const activePreset = matchPreset(value, today);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Every open starts from what is applied, so a cancelled edit never leaks back in.
      setDraft(value);
      setMonth(clampMonth(startOfMonth(value.from)));
    }
  };

  const applyPreset = (preset: Preset) => {
    onChange(preset.range(today));
    setOpen(false);
  };

  const handleDayClick = (day: Date) => {
    if (!draft?.from || draft.to) {
      setDraft({ from: day, to: undefined });
    } else if (isBefore(day, draft.from)) {
      setDraft({ from: day, to: draft.from });
    } else {
      setDraft({ from: draft.from, to: day });
    }
  };

  const applyDraft = () => {
    if (!draft?.from) return;
    // A single click is a one-day range.
    onChange({ from: draft.from, to: draft.to ?? draft.from });
    setOpen(false);
  };

  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => today.getFullYear() - i);
  const draftLabel = draft?.from
    ? draft.to
      ? formatRangeLabel({ from: draft.from, to: draft.to })
      : `${formatCalendarDate(draft.from)} – pick an end date`
    : "Pick a start date";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-xs font-normal"
          aria-label={`Date range: ${formatRangeLabel(value)}`}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {activePreset && <span className="text-muted-foreground">{activePreset.label}:</span>}
          <span>{formatRangeLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div
            className="flex flex-row flex-wrap gap-1 border-b border-border/40 p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r"
            role="group"
            aria-label="Quick ranges"
          >
            {DATE_RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 justify-start text-xs font-normal",
                  activePreset?.label === preset.label && "bg-accent font-medium",
                )}
                aria-pressed={activePreset?.label === preset.label}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-3 pt-3">
              <span className="text-xs text-muted-foreground">Jump to</span>
              <Select
                value={String(month.getMonth())}
                onValueChange={(m) =>
                  setMonth(clampMonth(new Date(month.getFullYear(), Number(m), 1)))
                }
              >
                <SelectTrigger className="h-7 w-[120px] text-xs" aria-label="Month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, index) => (
                    <SelectItem key={name} value={String(index)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(month.getFullYear())}
                onValueChange={(y) => setMonth(clampMonth(new Date(Number(y), month.getMonth(), 1)))}
              >
                <SelectTrigger className="h-7 w-[84px] text-xs" aria-label="Year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Calendar
              mode="range"
              numberOfMonths={numberOfMonths}
              month={month}
              onMonthChange={(next) => setMonth(clampMonth(next))}
              fromMonth={firstMonth}
              toMonth={addMonths(lastLeftMonth, numberOfMonths - 1)}
              disabled={{ after: today }}
              selected={draft}
              onSelect={(_, day) => handleDayClick(startOfDay(day))}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-3 py-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {draftLabel}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={!draft?.from} onClick={applyDraft}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
