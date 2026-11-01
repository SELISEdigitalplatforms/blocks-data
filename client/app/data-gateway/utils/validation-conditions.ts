import {
  LOGICAL_OPERATOR,
  NULL_OPERATORS,
  NUMBER_TO_OPERATOR,
  OPERATOR_TO_NUMBER,
  OPERATORS_BY_CATEGORY,
  getFieldTypeCategory,
} from "../constants/schema-access-control";
import type { IPolicyRule, IPolicyRuleGroup } from "../models/data-service";
import { RULE_MESSAGE_FORMATS, RULE_MESSAGES } from "./rule-messages";
import { BOOLEAN_VALUES, displayStaticValue, splitList, staticValueError, staticValueSpec } from "./rule-static-value";

/**
 * The "only when" condition of a validation rule, and the filter of a Reference / Must not exist in rule, as the rule
 * editor shows them: a flat list of rows joined by one AND / OR (decision 1). Stored as the policy model
 * (`PolicyRuleGroup`); read and written here without losing anything, so a row that wasn't changed goes back exactly as
 * it came. A stored condition the rows can't show (nested groups, an Auth value, an unknown operator) is kept whole and
 * shown read-only (D7).
 */

/** A property a condition can name: its full path, type, and an Enum's values. */
export interface ConditionField {
  path: string;
  type: string;
  isArray: boolean;
  enumValues?: string[];
}

export interface ConditionRow {
  id: string;
  field: string;
  /** The operator's key, e.g. "EQUAL" (OPERATOR_TO_NUMBER). */
  operator: string;
  /** A fixed value as stored: text, a number as text, "true"/"false", a UTC date "2025-01-01T09:30:00Z", or a comma-separated list. */
  value: string;
  /** "property" compares with another property of the same record (D5). */
  mode: "value" | "property";
  other: string;
  /** The stored rule this row was read from: sent back as it is while the row is unchanged. */
  original?: IPolicyRule;
}

export interface ConditionDraft {
  combine: "AND" | "OR";
  rows: ConditionRow[];
  /** A stored condition the rows can't show: kept and sent back unchanged. */
  locked: IPolicyRuleGroup | null;
}

const SOURCE = { AUTH: 0, SCHEMA_FIELD: 1, STATIC_VALUE: 2 } as const;
/** Operators the policy editor also leaves out of its menus. */
const HIDDEN_OPERATORS = ["REGEX"];
const LIST_OPERATORS = ["IN", "NOT_IN"];
/** Operators that can compare two properties of the record (Genesis `ValidationRuleCheck`). */
const FIELD_COMPARISON_OPERATORS = ["EQUAL", "NOT_EQUAL", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"];
/** Compared as Mongo does inside `$expr`, where the record's id is `_id`: refused by the server. */
const ITEM_ID = "ItemId";

let rowSequence = 0;
const nextRowId = () => `condition-${++rowSequence}`;

const isListOperator = (operator: string) => LIST_OPERATORS.includes(operator);
const isNullOperator = (operator: string) => NULL_OPERATORS.includes(operator);

/** The operators a property offers, from the policy editor's per-type lists. */
export function operatorsFor(field: ConditionField | undefined): string[] {
  const operators = OPERATORS_BY_CATEGORY[getFieldTypeCategory(field?.type, false)];
  return operators.filter((operator) => !HIDDEN_OPERATORS.includes(operator));
}

const LABELS: Record<string, string> = {
  EQUAL: "equals",
  NOT_EQUAL: "is not",
  GREATER_THAN: "greater than",
  GREATER_THAN_OR_EQUAL: "at least",
  LESS_THAN: "less than",
  LESS_THAN_OR_EQUAL: "at most",
  CONTAIN: "contains",
  NOT_CONTAIN: "doesn't contain",
  IN: "is one of",
  NOT_IN: "is not one of",
  START_WITH: "starts with",
  END_WITH: "ends with",
  IS_NULL: "is empty",
  IS_NOT_NULL: "is not empty",
  REGEX: "matches",
};
const DATE_LABELS: Record<string, string> = {
  GREATER_THAN: "is after",
  GREATER_THAN_OR_EQUAL: "on or after",
  LESS_THAN: "is before",
  LESS_THAN_OR_EQUAL: "on or before",
};

/** How an operator reads for a property's type: "is after" for dates, "is" for true/false. */
export function operatorLabel(operator: string, type: string): string {
  if (type === "DateTime" && DATE_LABELS[operator]) return DATE_LABELS[operator];
  if (type === "Boolean" && operator === "EQUAL") return "is";
  return LABELS[operator] ?? operator;
}

/** The kind two compared properties must share: Enum counts as text (D5). */
const kindOf = (type: string) => {
  switch (type) {
    case "Int":
    case "Float":
      return "number";
    case "DateTime":
      return "date";
    case "Boolean":
      return "boolean";
    default:
      return "text";
  }
};

export const canCompareProperties = (operator: string) => FIELD_COMPARISON_OPERATORS.includes(operator);

/** Properties a row may be compared with: single values of the same kind, never its own property or ItemId (D5). */
export function fittingProperties(row: ConditionRow, fields: ConditionField[]): string[] {
  const own = fields.find((f) => f.path === row.field);
  if (!own || !canCompareProperties(row.operator) || row.field === ITEM_ID) return [];
  return fields
    .filter((f) => !f.isArray && f.path !== row.field && f.path !== ITEM_ID && kindOf(f.type) === kindOf(own.type))
    .map((f) => f.path);
}

/** A new row on the first property, with its first operator. */
export function newConditionRow(fields: ConditionField[]): ConditionRow {
  const field = fields[0];
  return { id: nextRowId(), field: field?.path ?? "", operator: operatorsFor(field)[0] ?? "EQUAL", value: "", mode: "value", other: "" };
}

/** The row for a different property: its first operator and no value. */
export function rowForField(row: ConditionRow, path: string, fields: ConditionField[]): ConditionRow {
  const field = fields.find((f) => f.path === path);
  return { id: row.id, field: path, operator: operatorsFor(field)[0] ?? "EQUAL", value: "", mode: "value", other: "" };
}

/** The row with another operator: the value stays while it still fits, and a comparison falls back to a value (D5). */
export function rowForOperator(row: ConditionRow, operator: string): ConditionRow {
  const sameShape = isListOperator(row.operator) === isListOperator(operator) && !isNullOperator(operator);
  return {
    ...row,
    operator,
    value: sameShape ? row.value : "",
    mode: canCompareProperties(operator) ? row.mode : "value",
    other: canCompareProperties(operator) ? row.other : "",
  };
}

const staticText = (value: IPolicyRule["staticValue"]): string | null => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
};

function rowFromRule(rule: IPolicyRule): ConditionRow | null {
  const operator = NUMBER_TO_OPERATOR[rule.operator];
  if (!operator || HIDDEN_OPERATORS.includes(operator) || rule.leftSource !== SOURCE.SCHEMA_FIELD || !rule.leftOperand) return null;
  if (rule.rightSource === SOURCE.SCHEMA_FIELD) {
    return { id: nextRowId(), field: rule.leftOperand, operator, value: "", mode: "property", other: rule.rightOperand, original: rule };
  }
  if (rule.rightSource !== SOURCE.STATIC_VALUE) return null;
  // A list may also come in rightOperands, with no static value (the server reads either).
  const fromOperands = (rule.staticValue === null || rule.staticValue === undefined || rule.staticValue === "") && rule.rightOperands?.length;
  const value = fromOperands ? rule.rightOperands!.join(", ") : staticText(rule.staticValue);
  return value === null ? null : { id: nextRowId(), field: rule.leftOperand, operator, value, mode: "value", other: "", original: rule };
}

/** The editor's view of a stored condition; null when there is none. */
export function conditionDraftFrom(group: IPolicyRuleGroup | null | undefined): ConditionDraft | null {
  if (!group) return null;
  const combine = group.logicalOperator === LOGICAL_OPERATOR.OR ? "OR" : "AND";
  const rows = group.rules.map(rowFromRule);
  if ((group.nestedGroups?.length ?? 0) > 0 || rows.some((r) => r === null)) return { combine, rows: [], locked: group };
  return { combine, rows: rows as ConditionRow[], locked: null };
}

const unchanged = (row: ConditionRow) => {
  if (!row.original) return false;
  const read = rowFromRule(row.original);
  return !!read && read.field === row.field && read.operator === row.operator && read.mode === row.mode && read.other === row.other && read.value === row.value;
};

function ruleFromRow(row: ConditionRow): IPolicyRule {
  if (unchanged(row)) return row.original!;
  const property = row.mode === "property" && canCompareProperties(row.operator);
  let staticValue: string | null = null;
  if (!property && !isNullOperator(row.operator)) staticValue = isListOperator(row.operator) ? splitList(row.value).join(",") : row.value.trim();
  return {
    leftSource: SOURCE.SCHEMA_FIELD,
    leftOperand: row.field,
    operator: OPERATOR_TO_NUMBER[row.operator],
    rightSource: property ? SOURCE.SCHEMA_FIELD : SOURCE.STATIC_VALUE,
    rightOperand: property ? row.other : "",
    rightOperands: [],
    staticValue,
  };
}

/** The condition to store: a read-only one exactly as it came, otherwise one group of the rows. */
export function conditionGroupFrom(draft: ConditionDraft): IPolicyRuleGroup {
  if (draft.locked) return draft.locked;
  return {
    logicalOperator: draft.combine === "OR" ? LOGICAL_OPERATOR.OR : LOGICAL_OPERATOR.AND,
    rules: draft.rows.map(ruleFromRow),
    nestedGroups: [],
  };
}

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Why a row can't be saved yet, or null (D6). */
export function conditionRowError(row: ConditionRow, fields: ConditionField[]): string | null {
  const field = fields.find((f) => f.path === row.field);
  if (!field) return RULE_MESSAGE_FORMATS.UnknownProperty(row.field);
  if (isNullOperator(row.operator)) return null;
  if (row.mode === "property" && canCompareProperties(row.operator)) return row.other ? null : "Pick the property to compare with";

  const list = isListOperator(row.operator);
  const items = list ? splitList(row.value) : [row.value.trim()].filter(Boolean);
  switch (kindOf(field.type)) {
    case "boolean":
      return items.length ? null : "Pick a value";
    case "date":
      return items.length ? null : "Pick a date and time";
    case "number":
      if (!items.length || items.some((item) => !NUMBER_PATTERN.test(item))) return list ? "Enter numbers, separated by commas" : "Enter a number";
      return null;
  }
  if (field.type === "Enum" && field.enumValues?.length) {
    if (!items.length) return list ? "Pick at least one value" : "Pick a value";
    return staticValueError(staticValueSpec(field.type, false, field.enumValues), row.value, list);
  }
  if (!items.length) return list ? "Enter one or more values, separated by commas" : RULE_MESSAGES.ConditionNeedsValue;
  // As the server: "{{" starts a placeholder, which a fixed value can't hold.
  if (items.some((item) => item.includes("{{"))) return RULE_MESSAGES.PlaceholderNotAllowed;
  return !list && row.value.includes(",") ? RULE_MESSAGES.CommaInSingleValue : null;
}

/** Why a switched-on condition can't be saved yet, or null. Each row's own error shows on the row. */
export function conditionDraftError(draft: ConditionDraft, fields: ConditionField[], kind: "when" | "filter"): string | null {
  if (draft.locked) return null;
  if (draft.rows.length === 0) return kind === "when" ? "Add a condition, or turn “Only when” off." : "Add a condition, or turn the filter off.";
  return draft.rows.some((row) => conditionRowError(row, fields)) ? "Fix the conditions above" : null;
}

const SYMBOLS: Record<string, string> = {
  EQUAL: "=",
  NOT_EQUAL: "≠",
  GREATER_THAN: ">",
  GREATER_THAN_OR_EQUAL: "≥",
  LESS_THAN: "<",
  LESS_THAN_OR_EQUAL: "≤",
};

/** A fixed value as it reads: text in quotes, numbers, dates and true/false as they are (D4). */
function shownValue(value: string, field: ConditionField | undefined): string {
  const trimmed = value.trim();
  if (!trimmed) return "…";
  const type = field?.type;
  if (type === "DateTime") return displayStaticValue(staticValueSpec(type), trimmed);
  if (type === "Int" || type === "Float" || type === "Boolean") return trimmed;
  // A filter's target property may be unknown here: numbers and true/false still read as such.
  if (!type && (NUMBER_PATTERN.test(trimmed) || BOOLEAN_VALUES.includes(trimmed.toLowerCase()))) return trimmed;
  return `"${trimmed}"`;
}

/** One row in words, e.g. `Country = "DE"`, `Revenue ≥ Limit`, `Type is one of Business, Private` (D4). */
export function conditionRowText(row: ConditionRow, fields: ConditionField[]): string {
  const field = fields.find((f) => f.path === row.field);
  const type = field?.type ?? "";
  const name = row.field || "…";
  if (isNullOperator(row.operator)) return `${name} ${operatorLabel(row.operator, type)}`;
  if (isListOperator(row.operator)) {
    const items = splitList(row.value);
    return `${name} ${operatorLabel(row.operator, type)} ${items.length ? items.join(", ") : "…"}`;
  }
  if (row.mode === "property" && canCompareProperties(row.operator)) return `${name} ${SYMBOLS[row.operator]} ${row.other || "…"}`;
  const value = shownValue(row.value, field);
  if (type === "Boolean" || (type === "DateTime" && DATE_LABELS[row.operator])) return `${name} ${operatorLabel(row.operator, type)} ${value}`;
  return SYMBOLS[row.operator] ? `${name} ${SYMBOLS[row.operator]} ${value}` : `${name} ${operatorLabel(row.operator, type)} ${value}`;
}

/** The rows joined into one line: `Country = "DE" and Type is one of Business, Private`. */
export const conditionDraftText = (draft: ConditionDraft, fields: ConditionField[]) =>
  draft.locked ? conditionGroupText(draft.locked, fields) : draft.rows.map((row) => conditionRowText(row, fields)).join(draft.combine === "OR" ? " or " : " and ");

/** A stored condition in words, in full: nested groups in brackets (D7). */
export function conditionGroupText(group: IPolicyRuleGroup, fields: ConditionField[]): string {
  const join = group.logicalOperator === LOGICAL_OPERATOR.OR ? " or " : " and ";
  const rules = group.rules.map((rule) => {
    const row = rowFromRule(rule);
    return row ? conditionRowText(row, fields) : `${rule.leftOperand} ${LABELS[NUMBER_TO_OPERATOR[rule.operator]] ?? "?"} ${rule.rightOperand || String(rule.staticValue ?? "")}`.trim();
  });
  const nested = (group.nestedGroups ?? []).map((g) => `(${conditionGroupText(g, fields)})`);
  return [...rules, ...nested].join(join);
}
