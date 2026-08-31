import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

/**
 * One date-time vocabulary for the whole analytics section: "30 Aug 2026, 19:09" everywhere a
 * moment is shown, seconds added only where precision matters (log details), and "30 Aug" for
 * day buckets. Month names avoid the dd/MM vs MM/dd ambiguity of an all-numeric format.
 */
const DATE_TIME = "d MMM yyyy, HH:mm";
const DATE_TIME_WITH_SECONDS = "d MMM yyyy, HH:mm:ss";
const DAY = "d MMM";
const CALENDAR_DATE = "d MMM yyyy";

const EMPTY = "—";

const toDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Trace timestamps are UTC instants; render them in the viewer's timezone. */
export const formatDateTime = (value: string) => {
  const date = toDate(value);
  return date ? format(date, DATE_TIME) : EMPTY;
};

/** Same instant, to the second — for the log details panel. */
export const formatDateTimeWithSeconds = (value: string) => {
  const date = toDate(value);
  return date ? format(date, DATE_TIME_WITH_SECONDS) : EMPTY;
};

/** "5 minutes ago", "2 days ago" — the quickest way to read a log line. */
export const formatRelativeTime = (value: string) => {
  const date = toDate(value);
  return date ? formatDistanceToNowStrict(date, { addSuffix: true }) : EMPTY;
};

/**
 * Chart axis label for a day/week bucket. Buckets are calendar days rather than instants, so the
 * date part is read on its own — converting the UTC instant to local time could shift the label
 * onto the previous day.
 */
export const formatDayLabel = (value: string) => {
  const date = parseISO(value.slice(0, 10));
  return Number.isNaN(date.getTime()) ? EMPTY : format(date, DAY);
};

/** Date-range picker label: "24 Aug 2026". */
export const formatCalendarDate = (date: Date) => format(date, CALENDAR_DATE);

/** Durations are recorded in milliseconds. */
export const formatDuration = (durationMs: number) =>
  durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)} s` : `${Math.round(durationMs)} ms`;

export const formatSize = (bytes: number) => {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
