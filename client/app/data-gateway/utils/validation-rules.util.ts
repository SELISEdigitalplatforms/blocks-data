import { RegExpParser } from "regexpp";
import { typeOptions } from "../constants/input-restrictions";
import type { ISchemaFieldValidation, ValidationRuleValue } from "../models/data-service";
import { describeRelativeNow, isRelativeNowWritten, parseRelativeNow } from "./relative-now";
import { MAX_LIST_VALUES, RULE_MESSAGE_FORMATS, RULE_MESSAGES } from "./rule-messages";
import {
  conditionDraftError,
  conditionDraftFrom,
  conditionGroupFrom,
  type ConditionDraft,
  type ConditionField,
} from "./validation-conditions";
import { checkVariables, parseVariables, type VariableField } from "./variable-syntax";

/** Mirrors the server's ValidationType (Genesis); the API sends the number. */
export const VALIDATION_TYPE = {
  NotEmpty: 0,
  Regex: 1,
  MinLength: 2,
  MaxLength: 3,
  LengthRange: 4,
  Equal: 5,
  NotEqual: 6,
  GreaterThan: 7,
  LessThan: 8,
  GreaterThanOrEqual: 9,
  LessThanOrEqual: 10,
  Range: 11,
  Reference: 12,
  In: 13,
  NotIn: 14,
  MinItems: 15,
  MaxItems: 16,
  UniqueItems: 17,
  NotExistsIn: 18,
} as const;

export type ValidationTypeValue = (typeof VALIDATION_TYPE)[keyof typeof VALIDATION_TYPE];

/** Which inputs a rule type needs in the form. */
export type RuleInputKind = "none" | "regex" | "length" | "lengthRange" | "value" | "valueRange" | "reference" | "valueList" | "count";

/** `tag` is the short name on a rule's card where it differs from the menu label. */
export const VALIDATION_TYPE_META: Record<ValidationTypeValue, { label: string; input: RuleInputKind; tag?: string }> = {
  [VALIDATION_TYPE.NotEmpty]: { label: "Not empty", input: "none" },
  [VALIDATION_TYPE.Regex]: { label: "Matches a pattern", input: "regex" },
  [VALIDATION_TYPE.MinLength]: { label: "Min length", input: "length" },
  [VALIDATION_TYPE.MaxLength]: { label: "Max length", input: "length" },
  [VALIDATION_TYPE.LengthRange]: { label: "Length between", input: "lengthRange" },
  [VALIDATION_TYPE.Equal]: { label: "Equals", input: "value" },
  [VALIDATION_TYPE.NotEqual]: { label: "Does not equal", input: "value" },
  [VALIDATION_TYPE.GreaterThan]: { label: "Greater than", input: "value" },
  [VALIDATION_TYPE.LessThan]: { label: "Less than", input: "value" },
  [VALIDATION_TYPE.GreaterThanOrEqual]: { label: "At least", input: "value" },
  [VALIDATION_TYPE.LessThanOrEqual]: { label: "At most", input: "value" },
  [VALIDATION_TYPE.Range]: { label: "Between", input: "valueRange" },
  [VALIDATION_TYPE.Reference]: { label: "Exists in another schema", input: "reference" },
  [VALIDATION_TYPE.In]: { label: "Is one of", input: "valueList", tag: "One of" },
  [VALIDATION_TYPE.NotIn]: { label: "Is not one of", input: "valueList", tag: "Not one of" },
  [VALIDATION_TYPE.MinItems]: { label: "At least … items", input: "count", tag: "At least" },
  [VALIDATION_TYPE.MaxItems]: { label: "At most … items", input: "count", tag: "At most" },
  [VALIDATION_TYPE.UniqueItems]: { label: "No duplicates", input: "none" },
  [VALIDATION_TYPE.NotExistsIn]: { label: "Must not exist in another schema", input: "reference" },
};

/** Rules that check a whole list: the count, or duplicates. Every other rule checks each item of a list (D8). */
export const WHOLE_LIST_TYPES: ValidationTypeValue[] = [VALIDATION_TYPE.MinItems, VALIDATION_TYPE.MaxItems, VALIDATION_TYPE.UniqueItems];

/**
 * On a list property, what a rule checks: the whole list or each item. Null on a single value. A rule saved before
 * versions (0) checks the whole list, as the server does; Is one of always checks each item.
 */
export function ruleScope(type: number, isArray: boolean, evaluationVersion: number = CURRENT_EVALUATION_VERSION): "list" | "item" | null {
  if (!isArray) return null;
  if (WHOLE_LIST_TYPES.includes(type as ValidationTypeValue)) return "list";
  if (type === VALIDATION_TYPE.In || type === VALIDATION_TYPE.NotIn) return "item";
  return evaluationVersion < 1 ? "list" : "item";
}

/** Rules that look the value up in another schema. */
export const isLookupType = (type: number) => type === VALIDATION_TYPE.Reference || type === VALIDATION_TYPE.NotExistsIn;

/** The target field a Reference rule uses when none is picked. */
export const DEFAULT_REFERENCE_FIELD = "ItemId";

const T = VALIDATION_TYPE;
const COMPARISONS = [T.GreaterThan, T.LessThan, T.GreaterThanOrEqual, T.LessThanOrEqual, T.Range];

/** True for a property whose type is another schema (an object, or a list of objects). */
export const isObjectType = (fieldType: string) => !typeOptions.includes(fieldType);

/**
 * The rule types that make sense for a property's type. Must match what the server accepts: Reference and Must not
 * exist in only on text and number fields (Genesis `ReferenceRuleCompatibility`), Is one of not on dates or true/false.
 * The newer types come after today's, and a list property also gets the whole-list rules. A list of objects can only
 * be counted (No duplicates needs values), and a single object takes no rule.
 */
export function getAllowedValidationTypes(fieldType: string, isArray = false): ValidationTypeValue[] {
  if (isObjectType(fieldType)) return isArray ? [T.MinItems, T.MaxItems] : [];
  const types = singleValueTypes(fieldType);
  const lists: ValidationTypeValue[] = ["String", "ID", "Enum", "Int", "Float"].includes(fieldType) ? [T.In, T.NotIn] : [];
  const lookups: ValidationTypeValue[] = types.includes(T.Reference) ? [T.NotExistsIn] : [];
  return [...types, ...lists, ...lookups, ...(isArray ? WHOLE_LIST_TYPES : [])];
}

function singleValueTypes(fieldType: string): ValidationTypeValue[] {
  switch (fieldType) {
    case "String":
    case "ID":
      return [T.NotEmpty, T.Regex, T.MinLength, T.MaxLength, T.LengthRange, T.Equal, T.NotEqual, T.Reference];
    case "Int":
    case "Float":
      return [T.NotEmpty, T.Equal, T.NotEqual, ...COMPARISONS, T.Reference];
    case "DateTime":
      return [T.NotEmpty, T.Equal, T.NotEqual, ...COMPARISONS];
    case "Boolean":
      return [T.NotEmpty, T.Equal, T.NotEqual];
    case "Enum":
      return [T.NotEmpty, T.Equal, T.NotEqual, T.Reference];
    default:
      return [T.NotEmpty];
  }
}

/** How a compared value is entered: a number, a date-time, true/false, one of the enum values, or text. */
export type ValueKind = "number" | "date" | "boolean" | "enum" | "text";

export function valueKindForField(fieldType: string): ValueKind {
  switch (fieldType) {
    case "Int":
    case "Float":
      return "number";
    case "DateTime":
      return "date";
    case "Boolean":
      return "boolean";
    case "Enum":
      return "enum";
    default:
      return "text";
  }
}

/** The form's view of a rule: every value as text, as typed. */
export interface RuleDraft {
  type: ValidationTypeValue;
  value: string;
  secondaryValue: string;
  errorMessage: string;
  isActive: boolean;
  /** Is one of / is not one of: the values, as typed. */
  values?: string[];
  /** The version the rule was saved with (0 when saved without one); missing for a new rule. */
  evaluationVersion?: number;
  /** "Only when…": kept while switched off, saved only while on (D3). */
  when?: ConditionDraft | null;
  whenOn?: boolean;
  /** Reference / Must not exist in: only target records where… */
  targetFilter?: ConditionDraft | null;
  filterOn?: boolean;
  /** "Use the new behaviour" on an older Reference rule (D2, decision 5). */
  useNewBehaviour?: boolean;
  /** The rule as saved, for an edit: what the version decision compares with. Missing for a new rule. */
  saved?: { type: number; value: string; secondaryValue: string };
}

const hasConditions = (group: ISchemaFieldValidation["when"]) => !!group && (group.rules.length > 0 || (group.nestedGroups?.length ?? 0) > 0);

const asText = (value: ValidationRuleValue | undefined): string =>
  value === null || value === undefined || Array.isArray(value) ? "" : String(value);

export function draftFromRule(rule: ISchemaFieldValidation): RuleDraft {
  return {
    type: rule.type as ValidationTypeValue,
    value: asText(rule.value),
    secondaryValue: asText(rule.secondaryValue),
    errorMessage: rule.errorMessage ?? "",
    isActive: rule.isActive,
    values: Array.isArray(rule.value) ? rule.value.map(String) : [],
    evaluationVersion: rule.evaluationVersion ?? 0,
    when: conditionDraftFrom(rule.when),
    // A stored empty condition means "always", as on the server.
    whenOn: hasConditions(rule.when),
    targetFilter: conditionDraftFrom(rule.targetFilter),
    filterOn: hasConditions(rule.targetFilter),
    saved: { type: rule.type, value: asText(rule.value), secondaryValue: asText(rule.secondaryValue) },
  };
}

/** Saved before deleted records stopped counting: deleted target records still count (D2). */
export const isOlderReference = (rule: Pick<ISchemaFieldValidation, "type" | "evaluationVersion">) =>
  rule.type === VALIDATION_TYPE.Reference && (rule.evaluationVersion ?? 0) < 2;

/**
 * Comparison values may be one record variable, e.g. {{Employee.StartDate}}. Only text with "{{" or "}}"
 * is read as one, the same test the server makes, so fixed values stay fixed.
 */
export const looksLikeVariable = (text: string) => text.includes("{{") || text.includes("}}");

/** The schema a rule's variables refer to: its name and properties by full path. */
export interface RuleVariableContext {
  schemaName: string;
  fields: Record<string, VariableField>;
  /** An Enum property's values, by path; for "only when" conditions. */
  enumValues?: Record<string, string[]>;
}

/** True when the property sits inside a list of objects (Items.Qty), where a condition can't be scoped yet. */
export function isInsideListOfObjects(fieldPath: string, variables?: RuleVariableContext): boolean {
  const segments = fieldPath.split(".");
  return segments.slice(0, -1).some((_, i) => {
    const parent = variables?.fields[segments.slice(0, i + 1).join(".")];
    return !!parent && parent.isArray && parent.isObject;
  });
}

/** The properties an "only when" condition can name: the record's single values, never one inside a list of objects. */
export function conditionFieldsOf(variables?: RuleVariableContext): ConditionField[] {
  return Object.entries(variables?.fields ?? {})
    .filter(([path, field]) => !field.isObject && !field.isArray && !isInsideListOfObjects(path, variables))
    .map(([path, field]) => ({ path, type: field.type, isArray: false, enumValues: variables?.enumValues?.[path] }));
}

/** The server's kinds for comparing a variable with the property: Enum compares as text. */
export function variableKind(type: string): "number" | "date" | "boolean" | "text" {
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
}

const describeKind = (type: string, isArray: boolean) =>
  isArray ? "a list" : ({ number: "a number", date: "a date-time", boolean: "true or false", text: "text" } as const)[variableKind(type)];

/** A variable value's problem, with the server's messages (Genesis `ValidationVariableCheck`), or null. */
export function checkRuleVariable(text: string, fieldType: string, context: RuleVariableContext): string | null {
  const problem = checkVariables(text, "single", context.schemaName, context.fields);
  if (problem) return problem.message;
  const variable = parseVariables(text, "single", context.schemaName).parts.find((part) => part.prefix !== undefined);
  if (!variable) return null;
  const target = context.fields[variable.path!];
  if (variableKind(target.type) !== variableKind(fieldType) || target.isArray) {
    return `${variable.prefix}.${variable.path} is ${describeKind(target.type, target.isArray)} at position ${variable.position}: ${describeKind(fieldType, false)} is expected`;
  }
  return null;
}

/** The properties a comparison may name: single values of the same kind, as {{Schema.Path}}. */
export function fittingVariables(fieldType: string, context: RuleVariableContext, exclude?: string): string[] {
  return Object.entries(context.fields)
    .filter(([path, field]) => !field.isObject && !field.isArray && path !== exclude && variableKind(field.type) === variableKind(fieldType))
    .map(([path]) => `{{${context.schemaName}.${path}}}`);
}

const isWholeNumber = (text: string) => /^\d+$/.test(text.trim());
const isNumber = (text: string) => text.trim() !== "" && Number.isFinite(Number(text));

/**
 * Comparison values written as variables: each must name a fitting property (with `variables`; without them
 * the syntax is left to the server), and a fixed bound beside one is still checked for its type, since the
 * order is known only at insert. Undefined when no slot is a variable, so the fixed-value checks apply.
 */
function checkVariableSlots(slots: string[], fieldType: string, variables?: RuleVariableContext): string | null | undefined {
  if (!slots.some(looksLikeVariable)) return undefined;
  if (slots.includes("")) return slots.length === 1 ? "Value is required" : "Both values are required";
  // A date relative to now is not a variable: Genesis checks it on its own (ValidationRuleCheck).
  for (const slot of slots.filter((slot) => looksLikeVariable(slot) && !isRelativeNowWritten(slot))) {
    const problem = variables?.schemaName ? checkRuleVariable(slot, fieldType, variables) : null;
    if (problem) return problem;
  }
  const fixed = slots.filter((slot) => !looksLikeVariable(slot));
  return valueKindForField(fieldType) === "number" && fixed.some((slot) => !isNumber(slot)) ? "Not a valid number" : null;
}

function checkRegex(value: string): string | null {
  if (!value) return "Pattern is required";
  try {
    // Parse only — avoids constructing a RegExp from user input (ReDoS).
    new RegExpParser().parsePattern(value);
    return null;
  } catch {
    return "Invalid regex pattern";
  }
}

function checkLengthRange(value: string, secondary: string): string | null {
  if (!isWholeNumber(value) || !isWholeNumber(secondary)) return "Enter whole numbers of 0 or more";
  return Number(value) <= Number(secondary) ? null : "Min must be ≤ max";
}

function checkValue(value: string, fieldType: string): string | null {
  if (!value) return "Value is required";
  return valueKindForField(fieldType) === "number" && !isNumber(value) ? "Not a valid number" : null;
}

function checkValueRange(value: string, secondary: string, fieldType: string): string | null {
  if (!value || !secondary) return "Both values are required";
  const kind = valueKindForField(fieldType);
  if (kind === "number") {
    if (!isNumber(value) || !isNumber(secondary)) return "Not a valid number";
    return Number(value) <= Number(secondary) ? null : "Min must be ≤ max";
  }
  return kind === "date" && new Date(value) > new Date(secondary) ? "Min must be ≤ max" : null;
}

const ORDERING_TYPES: ValidationTypeValue[] = [T.GreaterThan, T.LessThan, T.GreaterThanOrEqual, T.LessThanOrEqual, T.Range];

/** A date relative to now in a comparison value: well formed, on a date-time property, in an ordering rule. */
function checkRelativeNow(slots: string[], type: ValidationTypeValue, fieldType: string): string | null | undefined {
  const written = slots.filter((slot) => isRelativeNowWritten(slot));
  if (written.length === 0) return undefined;
  const malformed = written.find((slot) => !parseRelativeNow(slot));
  if (malformed) return RULE_MESSAGE_FORMATS.InvalidNow(malformed);
  if (fieldType !== "DateTime") return RULE_MESSAGES.NowOnlyForDates;
  if (!ORDERING_TYPES.includes(type)) return RULE_MESSAGES.NowOnlyForComparisons;
  return null;
}

/** Is one of / is not one of: some values, at most 500, each of the property's type, none twice (Genesis `ValidationRuleCheck`). */
function checkValueList(values: string[], fieldType: string, options?: RuleCheckOptions): string | null {
  const items = values.map((v) => v.trim());
  if (items.length === 0) return RULE_MESSAGES.ValuesMustNotBeEmpty;
  if (items.length > MAX_LIST_VALUES) return RULE_MESSAGES.TooManyValues;
  const seen = new Set<string>();
  for (const item of items) {
    // 1.0 is a whole number, as on the server.
    if (fieldType === "Int" && !(isNumber(item) && Number.isInteger(Number(item)))) return RULE_MESSAGE_FORMATS.ValueDoesNotFit(item, "whole number");
    if (fieldType === "Enum" && options?.enumValues?.length && !options.enumValues.includes(item))
      return RULE_MESSAGE_FORMATS.ValueDoesNotFit(item, `value of ${options.fieldPath ?? "the property"}`);
    if (fieldType === "Float" && !isNumber(item)) return RULE_MESSAGE_FORMATS.ValueDoesNotFit(item, "number");
    // Exact match, as Equal: "de" and "DE" are two values; 2 and 2.0 are one.
    const key = fieldType === "Int" || fieldType === "Float" ? String(Number(item)) : item;
    if (seen.has(key)) return RULE_MESSAGE_FORMATS.DuplicateValue(item);
    seen.add(key);
  }
  return null;
}

/** The fixed-value check for each kind of rule input. */
const INPUT_CHECKS: Record<RuleInputKind, (value: string, secondary: string, fieldType: string) => string | null> = {
  none: () => null,
  regex: (value) => checkRegex(value),
  length: (value) => (isWholeNumber(value) ? null : "Enter a whole number of 0 or more"),
  lengthRange: (value, secondary) => checkLengthRange(value, secondary),
  value: (value, _secondary, fieldType) => checkValue(value, fieldType),
  valueRange: checkValueRange,
  reference: (value) => (value ? null : "Choose the schema the value must exist in"),
  // The list is checked from the draft's values, in checkRuleDraft.
  valueList: () => null,
  count: (value) => (isWholeNumber(value) ? null : RULE_MESSAGES.CountMustBeWholeNumber),
};

/** What the checks of a rule need besides the record's own properties. */
export interface RuleCheckOptions {
  /** The target schema's properties, for a Reference / Must not exist in filter. Without them only an empty filter is refused. */
  targetFields?: ConditionField[];
  /** The property's full path, e.g. Items.Qty. */
  fieldPath?: string;
  /** An Enum property's values. */
  enumValues?: string[];
}

/**
 * Why the draft cannot be saved yet, or null when it can. With `variables`, a comparison value written as
 * a variable is checked against the schema; without them its syntax is left to the server.
 */
export function checkRuleDraft(draft: RuleDraft, fieldType: string, variables?: RuleVariableContext, options?: RuleCheckOptions): string | null {
  const valueProblem = checkRuleValues(draft, fieldType, variables, options);
  if (valueProblem) return valueProblem;
  if (draft.whenOn && draft.when) {
    // The lookup runs whatever the record holds (Genesis refuses this too).
    if (isLookupType(draft.type)) return RULE_MESSAGES.ConditionOnLookup;
    if (options?.fieldPath && isInsideListOfObjects(options.fieldPath, variables)) return RULE_MESSAGES.ConditionInsideList;
    const problem = conditionDraftError(draft.when, conditionFieldsOf(variables), "when");
    if (problem) return problem;
  }
  if (isLookupType(draft.type) && draft.filterOn && draft.targetFilter) {
    const filter = options?.targetFields ? draft.targetFilter : { ...draft.targetFilter, rows: draft.targetFilter.rows.slice(0, 1) };
    if (draft.targetFilter.rows.length === 0 || options?.targetFields) return conditionDraftError(filter, options?.targetFields ?? [], "filter");
  }
  return null;
}

function checkRuleValues(draft: RuleDraft, fieldType: string, variables?: RuleVariableContext, options?: RuleCheckOptions): string | null {
  const input = VALIDATION_TYPE_META[draft.type]?.input;
  if (!input) return "Choose a rule type";
  const value = draft.value.trim();
  const secondary = draft.secondaryValue.trim();
  if (input === "valueList") return checkValueList(draft.values ?? [], fieldType, options);
  if (draft.type === T.NotExistsIn) {
    if (!value) return RULE_MESSAGES.TargetSchemaRequired;
    if (variables?.schemaName && value.toLowerCase() === variables.schemaName.toLowerCase()) return RULE_MESSAGES.NotExistsInOwnSchema;
  }
  if (input === "value" || input === "valueRange") {
    const slots = input === "value" ? [value] : [value, secondary];
    const nowProblem = checkRelativeNow(slots, draft.type, fieldType);
    if (nowProblem) return nowProblem;
    const variableProblem = checkVariableSlots(slots, fieldType, variables);
    if (variableProblem !== undefined) return variableProblem;
  }
  return INPUT_CHECKS[input](value, secondary, fieldType);
}

/**
 * The version rules added in the console are saved with. From 2, deleted target records no longer count for
 * Reference rules; every other rule type behaves as at version 1. A rule saved earlier keeps its version when edited.
 */
export const CURRENT_EVALUATION_VERSION = 2;

/**
 * The version a rule is saved with. A new rule gets the current one. An edited rule keeps its own (decision 5, R4),
 * raised to 1 only when the edit adds a variable or a date relative to now, and to the current one only with "Use
 * the new behaviour". A condition or a filter needs no version.
 */
function versionFor(draft: RuleDraft, input: RuleInputKind): number {
  const kept = draft.evaluationVersion;
  if (kept === undefined || draft.useNewBehaviour) return CURRENT_EVALUATION_VERSION;
  // Changed into a Reference rule: it has no older behaviour to keep.
  if (draft.type === VALIDATION_TYPE.Reference && draft.saved && draft.saved.type !== VALIDATION_TYPE.Reference) return CURRENT_EVALUATION_VERSION;
  // Only a variable the edit adds raises it: text the rule already held stays as it was read.
  const slots: [string, string | undefined][] = [
    [draft.value, draft.saved?.value],
    [draft.secondaryValue, draft.saved?.secondaryValue],
  ];
  const added = (input === "value" || input === "valueRange") && slots.some(([now, before]) => looksLikeVariable(now) && now.trim() !== (before ?? "").trim());
  return added && kept < 1 ? 1 : kept;
}

/**
 * The rule to send: lengths, counts and numbers as numbers, booleans as booleans, the rest as text; Is one of as a
 * list. An edited rule keeps its version (see `versionFor`). The condition and the filter are sent only while
 * switched on, so a rule without them is sent exactly as before.
 */
export function ruleFromDraft(draft: RuleDraft, fieldType: string): ISchemaFieldValidation {
  const input = VALIDATION_TYPE_META[draft.type].input;
  const kind = valueKindForField(fieldType);
  const convert = (text: string): ValidationRuleValue => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    if ((input === "value" || input === "valueRange") && looksLikeVariable(trimmed)) return trimmed;
    if (input === "length" || input === "lengthRange" || ((input === "value" || input === "valueRange") && kind === "number")) {
      return Number(trimmed);
    }
    if (input === "value" && kind === "boolean") return trimmed === "true";
    return trimmed;
  };

  let value: ValidationRuleValue = convert(draft.value);
  let secondaryValue: ValidationRuleValue = input === "lengthRange" || input === "valueRange" ? convert(draft.secondaryValue) : null;
  if (input === "none") value = null;
  if (input === "regex") value = draft.value.trim();
  if (input === "reference") secondaryValue = draft.secondaryValue.trim() || DEFAULT_REFERENCE_FIELD;
  if (input === "count") value = Number(draft.value.trim());
  if (input === "valueList") {
    const items = (draft.values ?? []).map((v) => v.trim()).filter(Boolean);
    value = kind === "number" ? items.map(Number) : items;
  }

  const rule: ISchemaFieldValidation = {
    type: draft.type,
    value,
    secondaryValue,
    errorMessage: draft.errorMessage,
    isActive: draft.isActive,
    evaluationVersion: versionFor(draft, input),
  };
  if (draft.whenOn && draft.when && !isLookupType(draft.type)) rule.when = conditionGroupFrom(draft.when);
  if (isLookupType(draft.type) && draft.filterOn && draft.targetFilter) rule.targetFilter = conditionGroupFrom(draft.targetFilter);
  return rule;
}

/** A list value on a card: the first three, then how many more, e.g. "Draft, Submitted, Approved +1". */
const shortList = (value: ValidationRuleValue) => {
  const items = Array.isArray(value) ? value.map(String) : [];
  return items.length > 3 ? `${items.slice(0, 3).join(", ")} +${items.length - 3}` : items.join(", ");
};

/** "{{Now-18y}}" → "now − 18 years"; anything else as it is. */
const nowOrText = (text: string) => {
  const now = parseRelativeNow(text);
  return now ? describeRelativeNow(now) : text;
};

/** One line describing a saved rule, e.g. "3–50 characters" or "Must exist in Department.ItemId". */
export function formatRuleSummary(rule: ISchemaFieldValidation): string {
  const value = nowOrText(asText(rule.value));
  const secondary = nowOrText(asText(rule.secondaryValue));
  switch (rule.type) {
    case T.NotEmpty:
      return "Must not be empty";
    case T.Regex:
      return value;
    case T.MinLength:
      return `At least ${value} characters`;
    case T.MaxLength:
      return `At most ${value} characters`;
    case T.LengthRange:
      return `${value}–${secondary} characters`;
    case T.Equal:
      return `= ${value}`;
    case T.NotEqual:
      return `≠ ${value}`;
    case T.GreaterThan:
      return `> ${value}`;
    case T.LessThan:
      return `< ${value}`;
    case T.GreaterThanOrEqual:
      return `≥ ${value}`;
    case T.LessThanOrEqual:
      return `≤ ${value}`;
    case T.Range:
      return `Between ${value} and ${secondary}`;
    case T.Reference:
      return `Must exist in ${value}.${secondary || DEFAULT_REFERENCE_FIELD}`;
    case T.In:
    case T.NotIn:
      return shortList(rule.value);
    case T.MinItems:
      return `At least ${value} ${value === "1" ? "item" : "items"}`;
    case T.MaxItems:
      return `At most ${value} ${value === "1" ? "item" : "items"}`;
    case T.UniqueItems:
      return "No duplicates";
    case T.NotExistsIn:
      return `Must not exist in ${value}.${secondary || DEFAULT_REFERENCE_FIELD}`;
    default:
      return value;
  }
}

/** The label for a rule type, including types this client does not know yet. */
export const ruleTypeLabel = (type: number) => VALIDATION_TYPE_META[type as ValidationTypeValue]?.label ?? `Type ${type}`;

/** The short name on a rule's card: the label, or a shorter tag for the newer types. */
export const ruleTypeTag = (type: number) => VALIDATION_TYPE_META[type as ValidationTypeValue]?.tag ?? ruleTypeLabel(type);

/** "{{Employee.StartDate}}" → "StartDate"; anything else as typed. */
const comparedName = (text: string) => {
  const trimmed = text.trim();
  const variable = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(trimmed);
  if (!variable) return trimmed;
  const parts = variable[1].split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : variable[1];
};

/** How a compared value reads in a sentence: a property by name, a date relative to now in words, a date-time without its "T". */
const readable = (text: string, fieldType: string) => {
  const now = parseRelativeNow(text);
  if (now) return describeRelativeNow(now);
  const name = comparedName(text);
  return fieldType === "DateTime" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(name) ? name.replace("T", " ") : name;
};

/**
 * A message to show when the validation fails, from the draft as it stands, e.g. "Salary must be
 * greater than 100" or "EndDate must be after StartDate". The property is named by its own name
 * (Address.City → City). Null until the values it needs are filled in. A pattern can't be put into
 * words, so it gets a general line.
 */
/**
 * What the server's own message names when the rule's message is left empty, which a fixed message can't: the
 * repeated value of No duplicates, or the date a bound relative to now stood for when the value was checked. Null
 * for every other rule. No message is suggested for these, so that one is used.
 */
export function messageLeftToServer(draft: Pick<RuleDraft, "type" | "value" | "secondaryValue">): "repeated" | "date" | null {
  if (draft.type === T.UniqueItems) return "repeated";
  return isRelativeNowWritten(draft.value.trim()) || isRelativeNowWritten(draft.secondaryValue.trim()) ? "date" : null;
}

export function suggestErrorMessage(draft: RuleDraft, fieldType: string, fieldName: string): string | null {
  if (messageLeftToServer(draft)) return null;
  const field = fieldName.split(".").pop() || fieldName;
  const v = draft.value.trim();
  const w = draft.secondaryValue.trim();
  const isDate = fieldType === "DateTime";
  const a = readable(v, fieldType);
  const b = readable(w, fieldType);
  const needOne = (message: string) => (v ? message : null);
  const needTwo = (message: string) => (v && w ? message : null);
  switch (draft.type) {
    case T.NotEmpty:
      return `${field} is required`;
    case T.Regex:
      return `${field} is not in the right format`;
    case T.MinLength:
      return needOne(`${field} must be at least ${a} ${a === "1" ? "character" : "characters"}`);
    case T.MaxLength:
      return needOne(`${field} must be at most ${a} ${a === "1" ? "character" : "characters"}`);
    case T.LengthRange:
      return needTwo(`${field} must be between ${a} and ${b} characters`);
    case T.Equal:
      return needOne(`${field} must be ${a}`);
    case T.NotEqual:
      return needOne(`${field} must not be ${a}`);
    case T.GreaterThan:
      return needOne(`${field} must be ${isDate ? "after" : "greater than"} ${a}`);
    case T.LessThan:
      return needOne(`${field} must be ${isDate ? "before" : "less than"} ${a}`);
    case T.GreaterThanOrEqual:
      return needOne(`${field} must be ${isDate ? "on or after" : "at least"} ${a}`);
    case T.LessThanOrEqual:
      return needOne(`${field} must be ${isDate ? "on or before" : "at most"} ${a}`);
    case T.Range:
      return needTwo(`${field} must be between ${a} and ${b}`);
    case T.Reference:
      return needOne(`${field} must match an existing ${v}`);
    case T.In:
    case T.NotIn: {
      const items = (draft.values ?? []).map((item) => item.trim()).filter(Boolean);
      if (items.length === 0) return null;
      return `${field} must ${draft.type === T.NotIn ? "not " : ""}be one of ${items.join(", ")}`;
    }
    case T.MinItems:
      return needOne(`${field} must have at least ${a} ${a === "1" ? "item" : "items"}`);
    case T.MaxItems:
      return needOne(`${field} must have at most ${a} ${a === "1" ? "item" : "items"}`);
    case T.NotExistsIn:
      return needOne(`${field} must not match an existing ${v}`);
    default:
      return null;
  }
}
