import type { IField } from "../models/data-service";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/**
 * The variable grammar of default values and validation rules: the client copy of Genesis
 * `VariableSyntax`. Both run the same table of cases in their tests, so the editor shows exactly the
 * message the server would return.
 *
 *   template := ( text | variable )*
 *   variable := "{{" space* name space* "}}"
 *   name     := "Auth." authName | schemaName "." segment ( "." segment )*
 */

export type VariableMode = "template" | "single";

export interface VariablePart {
  text?: string;
  prefix?: string;
  path?: string;
  /** 1-based position in the text. */
  position: number;
}

export interface VariableError {
  message: string;
  position: number;
}

export interface VariableField {
  type: string;
  isArray: boolean;
  isObject: boolean;
}

export const AUTH_PREFIX = "Auth";
export const AUTH_NAMES = ["UserId", "Email", "Roles", "Permissions", "OrganizationId"] as const;
const AUTH_LIST_NAMES = new Set(["roles", "permissions"]);
const SCALAR_TYPES = new Set(["String", "Int", "Float", "Boolean", "DateTime", "ID", "GeoJson", "Enum", "Json"]);
const NAME_PATTERN = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/;
const SEGMENT_PATTERN = /^[A-Za-z_]\w*$/;

export const isVariable = (part: VariablePart) => part.prefix !== undefined;
const isAuth = (part: VariablePart) => part.prefix?.toLowerCase() === AUTH_PREFIX.toLowerCase();
const nameOf = (part: VariablePart) => `${part.prefix}.${part.path}`;

const invalidName = (name: string, position: number): VariableError => ({
  message: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.INVALID_NAME_NAME_AT_POSITION_POSITION", { name, position }),
  position,
});

function checkNameShape(name: string, position: number, mode: VariableMode, schema: string): VariableError | null {
  if (!name.includes(".")) {
    if (!SEGMENT_PATTERN.test(name)) return invalidName(name, position);
    const target = mode === "template" ? `{{${schema}.${name}}} or {{Auth.…}}` : `{{${schema}.${name}}}`;
    return { message: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.MISSING_PREFIX_AT_POSITION_POSITION", { position, target }), position };
  }
  return NAME_PATTERN.test(name) ? null : invalidName(name, position);
}

const at = (message: string, position: number): VariableError => ({ message, position });

/** A "{" that doesn't start "{{", with the variable it most likely meant. */
function singleOpenBrace(text: string, i: number, schema: string): VariableError {
  const inner = text.slice(i + 1).split("}")[0].trim();
  const example = inner.length > 0 ? `{{${inner}}}` : `{{${schema}.Property}}`;
  return at(`Single "{" at position ${i + 1}: variables are written ${example}`, i + 1);
}

/** The variable starting at <paramref name="i"/> ("{{"): its part and where the text continues, or the error. */
function readVariable(
  text: string,
  i: number,
  mode: VariableMode,
  schema: string,
): { part: VariablePart; next: number } | { error: VariableError } {
  const position = i + 1;
  const close = text.indexOf("}}", i + 2);
  const nextOpen = text.indexOf("{{", i + 2);
  const unclosed = { error: at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.UNCLOSED_VARIABLE_AT_POSITION_POSITION", { position }), position) };
  if (close < 0 || (nextOpen >= 0 && nextOpen < close)) return unclosed;

  const name = text.slice(i + 2, close).trim();
  if (name.length === 0) return { error: at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.EMPTY_VARIABLE_AT_POSITION_POSITION", { position }), position) };
  if (name.includes("{") || name.includes("}")) return unclosed;

  const shapeError = checkNameShape(name, position, mode, schema);
  if (shapeError) return { error: shapeError };

  const dot = name.indexOf(".");
  return { part: { prefix: name.slice(0, dot), path: name.slice(dot + 1), position }, next: close + 2 };
}

/** In single-variable mode the whole value is one variable, with no text around it. */
function checkSingle(parts: VariablePart[]): VariableError | null {
  const variable = parts.find(isVariable);
  if (!variable || parts.length === 1) return null;
  return at(`A validation value is either a fixed value or one variable, e.g. {{${nameOf(variable)}}}`, 1);
}

/** At a "{" or "}": the variable that starts there, or the syntax error. */
function readBrace(
  text: string,
  i: number,
  mode: VariableMode,
  schema: string,
): { part: VariablePart; next: number } | { error: VariableError } {
  if (text[i] === "}") {
    const message = text.startsWith("}}", i) ? `Unexpected "}}" at position ${i + 1}` : `Single "}" at position ${i + 1}`;
    return { error: at(message, i + 1) };
  }
  if (text[i + 1] !== "{") return { error: singleOpenBrace(text, i, schema) };
  return readVariable(text, i, mode, schema);
}

/** Where the plain text starting at <paramref name="i"/> ends: the next brace, or the end. */
function textEnd(text: string, i: number): number {
  const brace = text.slice(i).search(/[{}]/);
  return brace < 0 ? text.length : i + brace;
}

/** Splits text into plain text and variables, checking the syntax only. */
export function parseVariables(
  text: string,
  mode: VariableMode,
  schemaName?: string,
): { parts: VariablePart[]; error: VariableError | null } {
  const schema = schemaName?.trim() ? schemaName : "Schema";
  const parts: VariablePart[] = [];
  let i = 0;
  while (i < text.length) {
    const end = textEnd(text, i);
    if (end > i) {
      parts.push({ text: text.slice(i, end), position: i + 1 });
      i = end;
      continue;
    }
    const read = readBrace(text, i, mode, schema);
    if ("error" in read) return { parts, error: read.error };
    parts.push(read.part);
    i = read.next;
  }
  return { parts, error: mode === "single" ? checkSingle(parts) : null };
}

const AUTH_CHOICES = AUTH_NAMES.map((n) => `Auth.${n}`).join(", ");

/** An {{Auth.X}} variable: allowed in templates only, a known name, a list only in a list property. */
function checkAuthPart(part: VariablePart, mode: VariableMode, targetIsList: boolean): VariableError | null {
  const { position } = part;
  if (mode === "single") return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.AUTH_VALUES_AREN_T_AVAILABLE_IN", { position }), position);
  const authName = AUTH_NAMES.find((n) => n.toLowerCase() === part.path?.toLowerCase());
  if (!authName) return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.UNKNOWN_VALUE_NAMEOF_AT_POSITION", { nameOf: nameOf(part), position, AUTH_CHOICES }), position);
  if (AUTH_LIST_NAMES.has(authName.toLowerCase()) && !targetIsList) {
    return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.AUTH_AUTHNAME_IS_A_LIST_AT", { authName, position }), position);
  }
  return null;
}

/** A {{Schema.Path}} variable: the schema's own prefix, an existing property, a single value. */
function checkFieldPart(part: VariablePart, mode: VariableMode, schemaName: string, fields: Record<string, VariableField>): VariableError | null {
  const { position } = part;
  if (part.prefix !== schemaName) {
    const allowed = mode === "template" ? tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.SCHEMANAME_OR_AUTH", { schemaName }) : schemaName;
    return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.UNKNOWN_PREFIX_PREFIX_AT_POSITION", { prefix: part.prefix ?? "", position, allowed }), position);
  }
  const field = fields[part.path!];
  if (!field) {
    const guess = closestName(part.path!, Object.keys(fields).filter((k) => !fields[k].isObject));
    const hint = guess ? " " + tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.DID_YOU_MEAN_SCHEMANAME_GUESS", { schemaName, guess }) : "";
    return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.UNKNOWN_PROPERTY_NAMEOF_AT_POSITION", { nameOf: nameOf(part), position, hint }), position);
  }
  if (field.isObject) {
    const child = Object.keys(fields).find((k) => k.startsWith(`${part.path}.`) && !fields[k].isObject);
    const example = child ? `, e.g. {{${schemaName}.${child}}}` : "";
    return at(tStatic(DATA_GATEWAY_SCHEMA_MODULE, "VARIABLE_SYNTAX.NAMEOF_HOLDS_AN_OBJECT_AT_POSITION", { nameOf: nameOf(part), position, example }), position);
  }
  return null;
}

/** Checks what each variable refers to: its prefix, and that the property exists and holds a single value. */
export function checkVariableReferences(
  parts: VariablePart[],
  mode: VariableMode,
  schemaName: string,
  fields: Record<string, VariableField>,
  targetIsList: boolean,
): VariableError | null {
  for (const part of parts.filter(isVariable)) {
    const problem = isAuth(part) ? checkAuthPart(part, mode, targetIsList) : checkFieldPart(part, mode, schemaName, fields);
    if (problem) return problem;
  }
  return null;
}

/** Parse and check in one go: the first problem, or null. */
export function checkVariables(
  text: string,
  mode: VariableMode,
  schemaName: string,
  fields: Record<string, VariableField>,
  targetIsList = false,
): VariableError | null {
  const { parts, error } = parseVariables(text, mode, schemaName);
  return error ?? checkVariableReferences(parts, mode, schemaName, fields, targetIsList);
}

/** The properties a variable may name, by full dotted path (nested fields included). */
export function variableFieldsOf(fields: IField[], prefix = ""): Record<string, VariableField> {
  const result: Record<string, VariableField> = {};
  for (const field of fields) {
    const path = `${prefix}${field.name}`;
    const isObject = !SCALAR_TYPES.has(field.type);
    result[path] = { type: field.type, isArray: field.isArray, isObject };
    if (isObject && field.fields?.length) Object.assign(result, variableFieldsOf(field.fields, `${path}.`));
  }
  return result;
}

function closestName(wanted: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const d = distance(wanted.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= 2 ? best : null;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
