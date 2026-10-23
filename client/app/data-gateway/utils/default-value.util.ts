import type { DefaultValueKind, IFieldDefaultValue } from "../models/data-service";
import { checkVariables, type VariableField } from "./variable-syntax";

/**
 * Default values: what a property can be given, the checks before saving, and the one-line summary.
 * Mirrors Genesis `FieldDefaultValueCheck` / `DefaultValueConverter`, with the same messages.
 *
 * The console has one value box, not a choice of kinds: the kind sent to the API follows from what
 * was entered. Text holding a variable is a `Template` (the console says "expression"), the current
 * date and time is `Now`, and anything else is `Static`.
 */

/** The one-line summary the API's own message says. Server refusals still say "template". */
export const expressionWording = (message: string) => message.replaceAll("template", "expression").replaceAll("Template", "Expression");

/** Set by the platform on every save; never defaulted. */
export const LOCKED_DEFAULT_PROPERTIES = ["ItemId", "CreatedBy", "LastUpdatedBy", "CreatedDate", "LastUpdatedDate"];

const SUPPORTED_TYPES = new Set(["String", "ID", "Int", "Float", "Boolean", "DateTime", "Enum"]);

export function canHaveDefault(fieldName: string, fieldType: string): boolean {
  return !LOCKED_DEFAULT_PROPERTIES.includes(fieldName) && SUPPORTED_TYPES.has(fieldType);
}

/** Kinds a property can take: expressions (the API's "Template") on text, Now on a single date-time. */
export function allowedDefaultKinds(fieldType: string, isArray: boolean): DefaultValueKind[] {
  const kinds: DefaultValueKind[] = ["Static"];
  if (canUseExpressions(fieldType)) kinds.push("Template");
  if (canUseNow(fieldType, isArray)) kinds.push("Now");
  return kinds;
}

/** Text properties may mix fixed text with record and signed-in user values. */
export const canUseExpressions = (fieldType: string) => fieldType === "String" || fieldType === "ID";

/** A single date-time may default to the current date and time. */
export const canUseNow = (fieldType: string, isArray: boolean) => fieldType === "DateTime" && !isArray;

/** One static item, as typed, checked against the property's type; null when it fits. */
export function checkStaticItem(text: string, fieldType: string, enumValues: string[] = []): string | null {
  const value = text.trim();
  switch (fieldType) {
    case "Int":
      return /^[+-]?\d+$/.test(value) && Math.abs(Number(value)) <= 2147483647 ? null : `"${value}" is not a whole number`;
    case "Float":
      return value !== "" && Number.isFinite(Number(value)) ? null : `"${value}" is not a number`;
    case "Boolean":
      return value === "true" || value === "false" ? null : `"${value}" is not true or false`;
    case "DateTime":
      return value !== "" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value) && isRealDate(value)
        ? null
        : `"${value}" is not a valid date-time`;
    case "Enum":
      return enumValues.length > 0 && !enumValues.includes(value)
        ? `"${value}" is not one of the listed values (${enumValues.join(", ")})`
        : null;
    default:
      return null;
  }
}

/** Rejects dates the browser silently rolls over (2025-02-30 → March 2). */
function isRealDate(value: string): boolean {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The value to send for one static item: numbers and booleans typed, everything else as text. */
export function convertStaticItem(text: string, fieldType: string): string | number | boolean {
  const value = text.trim();
  if (fieldType === "Int" || fieldType === "Float") return Number(value);
  if (fieldType === "Boolean") return value === "true";
  return value;
}

/** Which way a Now offset points: into the future or the past. Applied to every part on save. */
export type OffsetDirection = "+" | "-";

export interface DefaultDraft {
  /** What was typed: one item, or several for a list property. Text with a variable is an expression. */
  items: string[];
  /** The current date and time instead of the items (single date-time properties only). */
  useNow: boolean;
  /** The adjustment to the current date and time: its direction, then its parts as typed (magnitudes, normally). */
  direction: OffsetDirection;
  offset: { days: string; hours: string; minutes: string; seconds: string };
}

export const emptyDefaultDraft = (): DefaultDraft => ({
  items: [""],
  useNow: false,
  direction: "+",
  offset: { days: "0", hours: "0", minutes: "0", seconds: "0" },
});

/** Text holds an expression once it has a variable, or the start of one (so a half-typed one is checked). */
export const hasExpression = (text: string) => text.includes("{{");

/** A stored value as the form's text items: a list item by item, a single value as one item. */
function itemsOf(raw: IFieldDefaultValue["value"]): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return raw === null || raw === undefined ? [""] : [String(raw)];
}

export function draftFromDefault(value: IFieldDefaultValue | null | undefined): DefaultDraft {
  if (!value) return emptyDefaultDraft();
  const items = itemsOf(value.value);
  const offset = value.offset ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const parts = [offset.days, offset.hours, offset.minutes, offset.seconds];
  // One direction for the whole shift: into the past when every non-zero part is negative. A
  // mixed-sign offset (only reachable through import) keeps its signs in the parts themselves.
  const past = parts.some((n) => n !== 0) && parts.every((n) => n <= 0);
  const show = (n: number) => String(past ? Math.abs(n) : n);
  return {
    useNow: value.kind === "Now",
    items: value.kind === "Now" || items.length === 0 ? [""] : items,
    direction: past ? "-" : "+",
    offset: { days: show(offset.days), hours: show(offset.hours), minutes: show(offset.minutes), seconds: show(offset.seconds) },
  };
}

const OFFSET_LABELS = { days: "Days", hours: "Hours", minutes: "Minutes", seconds: "Seconds" } as const;

export interface DefaultTarget {
  fieldType: string;
  isArray: boolean;
  enumValues?: string[];
  schemaName: string;
  fields: Record<string, VariableField>;
}

/** The items a draft carries: every filled one for a list, the first for a single value. */
const draftItems = (draft: DefaultDraft, target: DefaultTarget) =>
  target.isArray ? draft.items.filter((item) => item.trim() !== "") : draft.items.slice(0, 1);

function checkStaticDraft(items: string[], target: DefaultTarget): string | null {
  if (items.length === 0 || (items[0] ?? "").trim() === "") {
    // Only a single text property may default to empty text.
    return target.fieldType === "String" && !target.isArray ? null : "A value is required";
  }
  for (const item of items) {
    const problem = checkStaticItem(item, target.fieldType, target.enumValues);
    if (problem) return problem;
  }
  return null;
}

function checkTemplateDraft(items: string[], target: DefaultTarget): string | null {
  if (target.fieldType !== "String" && target.fieldType !== "ID") return "Expressions can only be used on text properties";
  if (items.every((item) => item.trim() === "")) return "An expression is required";
  for (const item of items) {
    const problem = checkVariables(item, "template", target.schemaName, target.fields, target.isArray);
    if (problem) return problem.message;
  }
  return null;
}

function checkNowDraft(offset: DefaultDraft["offset"], target: DefaultTarget): string | null {
  if (target.fieldType !== "DateTime" || target.isArray) return "Now can only be used on single date-time properties";
  const notWhole = (Object.keys(OFFSET_LABELS) as Array<keyof typeof OFFSET_LABELS>).find((key) => !/^[+-]?\d+$/.test(offset[key].trim()));
  return notWhole ? `${OFFSET_LABELS[notWhole]} must be a whole number` : null;
}

/** The kind the API gets for this draft: Now, Template when any item holds a variable, else Static. */
export function draftKind(draft: DefaultDraft, target: Pick<DefaultTarget, "fieldType" | "isArray">): DefaultValueKind {
  if (draft.useNow) return "Now";
  const items = target.isArray ? draft.items : draft.items.slice(0, 1);
  return canUseExpressions(target.fieldType) && items.some(hasExpression) ? "Template" : "Static";
}

/** Why the draft can't be saved yet, or null. Same messages as the server. */
export function checkDefaultDraft(draft: DefaultDraft, target: DefaultTarget): string | null {
  switch (draftKind(draft, target)) {
    case "Static":
      return checkStaticDraft(draftItems(draft, target), target);
    case "Template":
      return checkTemplateDraft(draftItems(draft, target), target);
    case "Now":
      return checkNowDraft(draft.offset, target);
    default:
      return "Enter a value";
  }
}

/** The payload to save. */
export function defaultFromDraft(draft: DefaultDraft, target: DefaultTarget): IFieldDefaultValue {
  const items = draftItems(draft, target);
  const kind = draftKind(draft, target);
  if (kind === "Now") {
    const sign = draft.direction === "-" ? -1 : 1;
    // `|| 0` after the multiply, so a blank or zero part is 0 and never -0.
    const n = (s: string) => (Number.parseInt(s.trim(), 10) || 0) * sign || 0;
    return {
      kind: "Now",
      value: null,
      offset: { days: n(draft.offset.days), hours: n(draft.offset.hours), minutes: n(draft.offset.minutes), seconds: n(draft.offset.seconds) },
    };
  }
  if (kind === "Template") {
    return { kind: "Template", value: target.isArray ? items : (items[0] ?? "") };
  }
  const converted = items.map((item) => convertStaticItem(item, target.fieldType));
  return { kind: "Static", value: target.isArray ? converted : (converted[0] ?? "") };
}

const OFFSET_UNITS = ["days", "hours", "minutes", "seconds"] as const;

/** "1 day", "30 minutes". */
const amount = (n: number, unit: (typeof OFFSET_UNITS)[number]) => `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;

/** "30 days", "2 hours and 30 minutes", "1 day, 2 hours and 5 seconds". */
const listAmounts = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];

/**
 * The current date and time, adjusted, as a sentence: "The date and time the record is created",
 * "30 days after the record is created", "2 hours before the record is created". An offset with
 * mixed signs (only reachable through import) lists each part with its own sign.
 */
export function describeNow(offset: IFieldDefaultValue["offset"] | null | undefined): string {
  const parts = OFFSET_UNITS.filter((unit) => (offset?.[unit] ?? 0) !== 0).map((unit) => ({ unit, n: offset![unit] }));
  if (parts.length === 0) return "The date and time the record is created";
  const later = parts.every((p) => p.n > 0);
  const earlier = parts.every((p) => p.n < 0);
  if (later || earlier) {
    return `${listAmounts(parts.map((p) => amount(Math.abs(p.n), p.unit)))} ${later ? "after" : "before"} the record is created`;
  }
  const signed = parts.map((p) => `${p.n > 0 ? "+" : "−"}${amount(Math.abs(p.n), p.unit)}`);
  return `The date and time the record is created, ${signed.join(" ")}`;
}

/** One line for the DEF flag and the Rules button: "30 days after the record is created", or the value. */
export function formatDefaultSummary(value: IFieldDefaultValue | null | undefined): string {
  if (!value) return "";
  if (value.kind === "Now") return describeNow(value.offset);
  const raw = value.value;
  if (!Array.isArray(raw)) return String(raw ?? "");
  // Fixed text items are quoted, so ["admin", "app-user"] reads as a list of values.
  const quote = (item: string | number | boolean) => (typeof item === "string" && value.kind === "Static" ? JSON.stringify(item) : String(item));
  return "[" + raw.map(quote).join(", ") + "]";
}
