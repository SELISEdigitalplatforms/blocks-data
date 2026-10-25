/**
 * Dates relative to now in comparison values: {{Now}}, {{Now-18y}}, {{Now+30d}} (units y, mo, d, h, min). The same
 * grammar as Genesis `RelativeNow`, checked against the shared cases in rule-message-cases.json. The server works the
 * moment out on every save, in UTC.
 */

export type RelativeNowUnit = "" | "y" | "mo" | "d" | "h" | "min";

export interface RelativeNow {
  /** Signed: −18 for "18 ago". 0 with no unit is plain now. */
  amount: number;
  unit: RelativeNowUnit;
}

export const RELATIVE_NOW_UNITS: { unit: Exclude<RelativeNowUnit, "">; label: string }[] = [
  { unit: "y", label: "years" },
  { unit: "mo", label: "months" },
  { unit: "d", label: "days" },
  { unit: "h", label: "hours" },
  { unit: "min", label: "minutes" },
];

// "{{Now}}", or "{{Now" followed by a sign: anything else starting "{{Now" ("{{Nowhere}}", "{{Now.X}}") is not this form.
const START = /^\s*\{\{\s*Now\s*(\}\}|[+-])/;
const SHAPE = /^\s*\{\{\s*Now\s*(?:([+-])\s*([1-9][0-9]{0,3})\s*(y|mo|d|h|min))?\s*\}\}\s*$/;

/** True when the value is meant as a date relative to now, well formed or not. */
export const isRelativeNowWritten = (value: unknown): value is string => typeof value === "string" && START.test(value);

/** The offset a well-formed value means; null for anything else. */
export function parseRelativeNow(value: unknown): RelativeNow | null {
  if (typeof value !== "string") return null;
  const match = SHAPE.exec(value);
  if (!match) return null;
  if (!match[1]) return { amount: 0, unit: "" };
  const amount = Number(match[2]);
  return { amount: match[1] === "-" ? -amount : amount, unit: match[3] as RelativeNowUnit };
}

/** The stored text for an offset: "{{Now}}", "{{Now-18y}}". */
export const relativeNowText = (now: RelativeNow) =>
  !now.unit || now.amount === 0 ? "{{Now}}" : `{{Now${now.amount < 0 ? "-" : "+"}${Math.abs(now.amount)}${now.unit}}}`;

const UNIT_WORD: Record<Exclude<RelativeNowUnit, "">, string> = { y: "year", mo: "month", d: "day", h: "hour", min: "minute" };

/** How messages and cards name it: "now", "now − 18 years", "now + 1 month". */
export function describeRelativeNow(now: RelativeNow): string {
  if (!now.unit || now.amount === 0) return "now";
  const count = Math.abs(now.amount);
  return `now ${now.amount < 0 ? "−" : "+"} ${count} ${UNIT_WORD[now.unit]}${count === 1 ? "" : "s"}`;
}

/** The calendar's ends on the server (.NET DateTime.MinValue / MaxValue), where a far offset is clamped. */
const EARLIEST = (() => {
  // Date.UTC reads years 0–99 as 1900–1999, so year 1 is set on its own.
  const date = new Date(0);
  date.setUTCFullYear(1, 0, 1);
  return date.getTime();
})();
const LATEST = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/**
 * The moment it means, from `nowUtc`, as the server works it out: years and months with calendar maths; years, months
 * and days as whole UTC days (the start of that day, the date messages name); clamped to the calendar's ends.
 */
export function relativeNowFrom(now: RelativeNow, nowUtc: Date): Date {
  const moment = offsetFrom(now, nowUtc);
  if (moment.getTime() > LATEST) return new Date(LATEST);
  if (moment.getTime() < EARLIEST) return new Date(EARLIEST);
  if (now.unit === "y" || now.unit === "mo" || now.unit === "d") moment.setUTCHours(0, 0, 0, 0);
  return moment;
}

function offsetFrom(now: RelativeNow, nowUtc: Date): Date {
  const date = new Date(nowUtc.getTime());
  switch (now.unit) {
    case "y":
      return addMonths(date, now.amount * 12);
    case "mo":
      return addMonths(date, now.amount);
    case "d":
      date.setUTCDate(date.getUTCDate() + now.amount);
      break;
    case "h":
      date.setUTCHours(date.getUTCHours() + now.amount);
      break;
    case "min":
      date.setUTCMinutes(date.getUTCMinutes() + now.amount);
      break;
  }
  return date;
}

/** Months forward or back, keeping the day where the month has it and the month's last day otherwise. */
function addMonths(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(date.getTime());
  result.setUTCFullYear(year, month, Math.min(date.getUTCDate(), lastDay));
  return result;
}
