/**
 * The static value of an access rule, entered the way the compared property's type is: a dropdown for
 * Boolean and Enum, a UTC date-time picker for DateTime, a checked box for Int and Float, plain text
 * otherwise. The value is always sent as text ("true", "10", "2025-01-01T09:30:00Z"); the server reads it
 * back as the property's type.
 */
export type StaticValueKind = "boolean" | "enum" | "date" | "int" | "float" | "text";

export interface StaticValueSpec {
  kind: StaticValueKind;
  /** The Enum property's allowed values; empty for every other kind. */
  enumValues: string[];
}

export const TEXT_VALUE_SPEC: StaticValueSpec = { kind: "text", enumValues: [] };

export const BOOLEAN_VALUES = ["true", "false"];

const INT_TYPES = new Set(["int", "int32", "int64", "long"]);
const FLOAT_TYPES = new Set(["float", "double", "decimal"]);

/** How a property of this type takes a static value. Lists and an Enum without values stay text. */
export function staticValueSpec(
  type?: string | null,
  isArray?: boolean | null,
  enumValues?: string[] | null,
): StaticValueSpec {
  if (isArray) return TEXT_VALUE_SPEC;
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "boolean" || normalized === "bool") return { kind: "boolean", enumValues: [] };
  if (normalized === "datetime" || normalized === "date") return { kind: "date", enumValues: [] };
  if (INT_TYPES.has(normalized)) return { kind: "int", enumValues: [] };
  if (FLOAT_TYPES.has(normalized)) return { kind: "float", enumValues: [] };
  if (normalized === "enum" && enumValues?.length) return { kind: "enum", enumValues };
  return TEXT_VALUE_SPEC;
}

/** The items of an In / Not in value, "a, b" → ["a", "b"]. */
export const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// The forms the server reads as numbers and dates (DataAccessPolicyHelper.ParseNumber / ParseIsoDate).
const INT_PATTERN = /^[+-]?\d+$/;
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

const isValidItem = (spec: StaticValueSpec, item: string): boolean => {
  switch (spec.kind) {
    case "boolean":
      return BOOLEAN_VALUES.includes(item.toLowerCase());
    case "enum":
      return spec.enumValues.includes(item);
    case "date":
      return ISO_DATE_PATTERN.test(item) && !Number.isNaN(Date.parse(item));
    case "int":
      return INT_PATTERN.test(item);
    case "float":
      return NUMBER_PATTERN.test(item);
    default:
      return true;
  }
};

const ONE_VALUE_MESSAGE: Record<StaticValueKind, string> = {
  boolean: "Choose true or false",
  enum: "Choose one of the property's values",
  date: "Enter a date and time",
  int: "Enter a whole number",
  float: "Enter a number",
  text: "",
};

const LIST_MESSAGE: Record<StaticValueKind, string> = {
  boolean: "Choose true or false",
  enum: "Choose from the property's values",
  date: "Enter dates separated by commas",
  int: "Enter whole numbers separated by commas",
  float: "Enter numbers separated by commas",
  text: "",
};

/** Why a non-empty static value does not fit its property, or null when it does. */
export function staticValueError(
  spec: StaticValueSpec,
  value: string,
  isList: boolean,
): string | null {
  if (spec.kind === "text" || !value.trim()) return null;
  const items = isList ? splitList(value) : [value.trim()];
  if (items.every((item) => isValidItem(spec, item))) return null;
  return (isList ? LIST_MESSAGE : ONE_VALUE_MESSAGE)[spec.kind];
}

/** A trailing "Z" or "+06:00" / "-0500" zone. */
const ZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A stored date ("2025-01-01T09:30:00Z", or an older "2025-01-01") as the picker's UTC "2025-01-01T09:30".
 * One with a zone is converted to UTC; one without is already read as UTC by the server, so it is kept.
 */
export function toDateInput(stored: string): string {
  const text = stored.trim();
  if (ZONE_PATTERN.test(text) && ISO_DATE_PATTERN.test(text)) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? "" : new Date(ms).toISOString().slice(0, 16);
  }
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(text);
  if (!match) return "";
  return `${match[1]}T${match[2] ?? "00:00"}`;
}

/** The picker's "2025-01-01T09:30", read as UTC, as the stored "2025-01-01T09:30:00Z". */
export function fromDateInput(input: string): string {
  return input ? `${input}:00Z` : "";
}

/** How a static value reads in its chip: dates as "2025-01-01 09:30 UTC", everything else as stored. */
export function displayStaticValue(spec: StaticValueSpec, value: string): string {
  if (spec.kind !== "date" || !value) return value;
  const input = toDateInput(value);
  return input ? `${input.replace("T", " ")} UTC` : value;
}
