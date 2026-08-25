import {
  IN_OPERATORS,
  NUMBER_TO_OPERATOR,
  NUMBER_TO_SOURCE_LABEL,
  NUMBER_TO_SOURCE_TYPE,
  READABLE_OPERATORS,
  RULE_SOURCE_TYPES,
} from "../constants/schema-access-control";
import type { IField, IPolicyRule } from "../models/data-service";

// ─── Policy Rule Conversion ──────────────────────────────────────────────────

/** Convert a policy rule into a human-readable sentence */
export function ruleToText(rule: IPolicyRule): string {
  const source = NUMBER_TO_SOURCE_LABEL[rule.leftSource] ?? `Source(${rule.leftSource})`;
  const field = rule.leftOperand;
  const operator = READABLE_OPERATORS[rule.operator] ?? `operator(${rule.operator})`;

  // Null operators don't need a right side
  if (rule.operator === 12 || rule.operator === 13) {
    return `${source}'s ${field} ${operator}`;
  }

  // Static value → show quoted value
  if (rule.rightSource === 2) {
    const staticDisplay = Array.isArray(rule.staticValue)
      ? rule.staticValue.map((v) => `"${v}"`).join(", ")
      : `"${rule.staticValue ?? ""}"`;
    return `${source}'s ${field} ${operator} ${staticDisplay}`;
  }

  // Auth or Schema Field → show source label + field name
  const rightSource = NUMBER_TO_SOURCE_LABEL[rule.rightSource] ?? `Source(${rule.rightSource})`;
  const rightOperandDisplay = rule.rightOperands?.length
    ? rule.rightOperands.join(", ")
    : rule.rightOperand;
  return `${source}'s ${field} ${operator} ${rightSource}'s ${rightOperandDisplay}`;
}

/** Convert an API policy rule (numeric) to form values (string keys) */
export function policyRuleToFormRow(rule: IPolicyRule) {
  const compareSource = NUMBER_TO_SOURCE_TYPE[rule.rightSource] ?? RULE_SOURCE_TYPES.STATIC_VALUE;
  const operatorKey = NUMBER_TO_OPERATOR[rule.operator] ?? "";
  const isContain = IN_OPERATORS.includes(operatorKey);
  const isDirectValue = ["REGEX", "START_WITH", "END_WITH"].includes(operatorKey);

  let compareValue: string;
  if (isDirectValue) {
    compareValue = (rule.staticValue as string) ?? "";
  } else if (compareSource === RULE_SOURCE_TYPES.STATIC_VALUE) {
    compareValue =
      isContain && Array.isArray(rule.staticValue)
        ? rule.staticValue.join(", ")
        : ((rule.staticValue as string) ?? "");
  } else {
    compareValue = rule.rightOperands?.length
      ? rule.rightOperands.join(",")
      : (rule.rightOperand ?? "");
  }

  return {
    source: NUMBER_TO_SOURCE_TYPE[rule.leftSource] ?? "",
    field: rule.leftOperand,
    operator: operatorKey,
    compareSource,
    compareValue,
  };
}

// ─── Field Access Level Resolution ───────────────────────────────────────────

export type FieldAccessLevelKey =
  | "readAccessLevel"
  | "writeAccessLevel"
  | "editAccessLevel"
  | "deleteAccessLevel";

/** Walk nested `IField.fields` using a dotted path (e.g. Products.name). */
export const findFieldAtDottedPath = (
  rootFields: IField[],
  dottedPath: string,
): IField | undefined => {
  const segments = dottedPath.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;

  let list: IField[] = rootFields;
  let node: IField | undefined;

  for (let i = 0; i < segments.length; i++) {
    node = list.find((f) => f.name === segments[i]);
    if (!node) return undefined;
    if (i === segments.length - 1) return node;
    list = node.fields ?? [];
  }

  return undefined;
};

export const resolveFieldAccessLevel = (
  fields: IField[],
  fieldNames: string[],
  key: FieldAccessLevelKey,
): number | undefined => {
  if (fieldNames.length === 1 && fieldNames[0].includes(".")) {
    const path = fieldNames[0];
    let target = findFieldAtDottedPath(fields, path);
    // Child schema tables receive flat `fields` but policy paths stay root-qualified (e.g. Products.name).
    if (!target) {
      const leaf = path.split(".").pop();
      target = leaf ? fields.find((f) => f.name === leaf) : undefined;
    }
    return target?.[key];
  }

  const selectedFields = fields.filter((f) => fieldNames.includes(f.name));
  if (selectedFields.length === 0) return undefined;
  const firstLevel = selectedFields[0][key];
  const allSame = selectedFields.every((f) => f[key] === firstLevel);

  return allSame ? firstLevel : 1;
};
