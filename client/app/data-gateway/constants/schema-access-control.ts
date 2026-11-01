import { tStatic } from "@seliseblocks/genesis-os/i18n";
export const PERMISSION_ACTIONS = [
  { id: "view", get label() { return tStatic("data.gateway.access", "common:VIEW"); }, value: "view" },
  { id: "create", get label() { return tStatic("data.gateway.access", "common:CREATE"); }, value: "create" },
  { id: "edit", get label() { return tStatic("data.gateway.access", "common:EDIT"); }, value: "edit" },
  { id: "delete", get label() { return tStatic("data.gateway.access", "common:DELETE"); }, value: "delete" },
];

export const ACCESS_TYPES = {
  LOGGED_IN: "logged-in",
  PUBLIC: "public",
  CUSTOM: "custom",
  INHERITED: "inherited",
};

export const RULE_SOURCE_TYPES = {
  AUTH: "auth",
  SCHEMA_FIELD: "schema-field",
  STATIC_VALUE: "static-value",
} as const;

export const RULE_SOURCE_OPTIONS = [
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.AUTH"); }, value: RULE_SOURCE_TYPES.AUTH },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.SCHEMA_FIELDS"); }, value: RULE_SOURCE_TYPES.SCHEMA_FIELD },
  // { label: "Static Value", value: RULE_SOURCE_TYPES.STATIC_VALUE },
];

export const COMPARE_SOURCE_OPTIONS = [
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.AUTH"); }, value: RULE_SOURCE_TYPES.AUTH },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.SCHEMA_FIELDS"); }, value: RULE_SOURCE_TYPES.SCHEMA_FIELD },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.STATIC_VALUE"); }, value: RULE_SOURCE_TYPES.STATIC_VALUE },
];

/** Mirrors GraphQlConstant.MaxNestedLevelIterationLimit (server/DataGateway.DomainService) */
export const MAX_NESTED_FIELD_DEPTH = 3;

/**
 * How many group levels the rule-set editor will build: the root plus two
 * nested levels. The server allows unlimited depth, so deeper policies that
 * arrive by API or import still load and save intact; this only stops the
 * editor adding levels past it.
 */
export const MAX_RULE_GROUP_DEPTH = 3;

export const FIELD_TYPE_CATEGORY = {
  STRING: "string",
  ARRAY: "array",
  NUMERIC: "numeric",
  BOOLEAN: "boolean",
  DATE: "date",
  ENUM: "enum",
} as const;

export type FieldTypeCategory = (typeof FIELD_TYPE_CATEGORY)[keyof typeof FIELD_TYPE_CATEGORY];

export const AUTH_FIELD_OPTIONS = [
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.USERID"); }, value: "userId", category: FIELD_TYPE_CATEGORY.STRING },
  { get label() { return tStatic("data.gateway.access", "common:EMAIL"); }, value: "email", category: FIELD_TYPE_CATEGORY.STRING },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.ROLES"); }, value: "roles", category: FIELD_TYPE_CATEGORY.ARRAY },
  {
    get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.PERMISSIONS"); },
    value: "permissions",
    category: FIELD_TYPE_CATEGORY.ARRAY,
  },
  {
    get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.ORGANIZATIONID"); },
    value: "organizationId",
    category: FIELD_TYPE_CATEGORY.STRING,
  },
  // TODO: we will need them later
  // { label: "TenantId", value: "tenantId", category: FIELD_TYPE_CATEGORY.STRING },
  // { label: "Custom Claims", value: "customClaims", category: FIELD_TYPE_CATEGORY.STRING },
];

export const RULE_OPERATORS = [
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.EQUAL"); }, value: "EQUAL" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_EQUAL"); }, value: "NOT_EQUAL" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.GREATER_THAN"); }, value: "GREATER_THAN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.GREATER_THAN_OR_EQUAL"); }, value: "GREATER_THAN_OR_EQUAL" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.LESS_THAN"); }, value: "LESS_THAN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.LESS_THAN_OR_EQUAL"); }, value: "LESS_THAN_OR_EQUAL" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.CONTAIN"); }, value: "CONTAIN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_CONTAIN"); }, value: "NOT_CONTAIN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IN"); }, value: "IN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_IN"); }, value: "NOT_IN" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.START_WITH"); }, value: "START_WITH" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.END_WITH"); }, value: "END_WITH" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NULL"); }, value: "IS_NULL" },
  { get label() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NOT_NULL"); }, value: "IS_NOT_NULL" },
  // { label: "Regex", value: "REGEX" },
];

/** Numeric mappings matching the API contract */
export const SOURCE_TYPE_TO_NUMBER: Record<string, number> = {
  [RULE_SOURCE_TYPES.AUTH]: 0,
  [RULE_SOURCE_TYPES.SCHEMA_FIELD]: 1,
  [RULE_SOURCE_TYPES.STATIC_VALUE]: 2,
};

export const OPERATOR_TO_NUMBER: Record<string, number> = {
  EQUAL: 0,
  NOT_EQUAL: 1,
  GREATER_THAN: 2,
  GREATER_THAN_OR_EQUAL: 3,
  LESS_THAN: 4,
  LESS_THAN_OR_EQUAL: 5,
  CONTAIN: 6,
  NOT_CONTAIN: 7,
  IN: 8,
  NOT_IN: 9,
  START_WITH: 10,
  END_WITH: 11,
  IS_NULL: 12,
  IS_NOT_NULL: 13,
  REGEX: 14,
};

/** Reverse mappings: number → source-type string key (for prefilling forms) */
export const NUMBER_TO_SOURCE_TYPE: Record<number, string> = {
  0: RULE_SOURCE_TYPES.AUTH,
  1: RULE_SOURCE_TYPES.SCHEMA_FIELD,
  2: RULE_SOURCE_TYPES.STATIC_VALUE,
};

/** Reverse mappings: number → operator string key (for prefilling forms) */
export const NUMBER_TO_OPERATOR: Record<number, string> = {
  0: "EQUAL",
  1: "NOT_EQUAL",
  2: "GREATER_THAN",
  3: "GREATER_THAN_OR_EQUAL",
  4: "LESS_THAN",
  5: "LESS_THAN_OR_EQUAL",
  6: "CONTAIN",
  7: "NOT_CONTAIN",
  8: "IN",
  9: "NOT_IN",
  10: "START_WITH",
  11: "END_WITH",
  12: "IS_NULL",
  13: "IS_NOT_NULL",
  14: "REGEX",
};

export const LOGICAL_OPERATOR = {
  AND: 0,
  OR: 1,
} as const;

export const POLICY_TYPE = {
  ROW: 0,
  COLUMN: 1,
} as const;

export const POLICY_OPERATION = {
  READ: 0,
  CREATE: 1,
  UPDATE: 2,
  DELETE: 3,
  ALL: 4,
} as const;

/** Short display labels for access type badges */
export const ACCESS_TYPE_SHORT_LABELS: Record<string, string> = {
  get [ACCESS_TYPES.LOGGED_IN]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.LOGGED_IN_USERS"); },
  get [ACCESS_TYPES.PUBLIC]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.PUBLIC"); },
  get [ACCESS_TYPES.CUSTOM]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.CUSTOM"); },
  get [ACCESS_TYPES.INHERITED]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.INHERITED"); },
};

/** SchemaAccessLevel enum: number → ACCESS_TYPES string */
export const ACCESS_LEVEL_TO_TYPE: Record<number, string> = {
  0: ACCESS_TYPES.INHERITED,
  1: ACCESS_TYPES.LOGGED_IN,
  2: ACCESS_TYPES.PUBLIC,
  3: ACCESS_TYPES.CUSTOM,
};

/** ACCESS_TYPES string → SchemaAccessLevel enum number */
export const ACCESS_TYPE_TO_LEVEL: Record<string, number> = {
  [ACCESS_TYPES.INHERITED]: 0,
  [ACCESS_TYPES.LOGGED_IN]: 1,
  [ACCESS_TYPES.PUBLIC]: 2,
  [ACCESS_TYPES.CUSTOM]: 3,
};

/** Reverse mappings: number → display label */
export const NUMBER_TO_SOURCE_LABEL: Record<number, string> = {
  get 0() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.AUTH"); },
  get 1() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.SCHEMA_FIELDS"); },
  get 2() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.STATIC_VALUE"); },
};

/** Operators valid per field type category */
export const STRING_OPERATORS = [
  "EQUAL",
  "NOT_EQUAL",
  "IN",
  "NOT_IN",
  "START_WITH",
  "END_WITH",
  "IS_NULL",
  "IS_NOT_NULL",
  "REGEX",
];

export const ARRAY_OPERATORS = ["CONTAIN", "NOT_CONTAIN", "IS_NULL", "IS_NOT_NULL"];

export const NUMERIC_OPERATORS = [
  "EQUAL",
  "NOT_EQUAL",
  "IN",
  "NOT_IN",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "IS_NULL",
  "IS_NOT_NULL",
];

/** true / false: In and Not in add nothing to Equal and Not equal, and ordering means nothing. */
export const BOOLEAN_OPERATORS = ["EQUAL", "NOT_EQUAL", "IS_NULL", "IS_NOT_NULL"];

/** A list of exact date-times is rarely what anyone means, so dates compare and order only. */
export const DATE_OPERATORS = NUMERIC_OPERATORS.filter((op) => op !== "IN" && op !== "NOT_IN");

/** One of the property's values, or several for In / Not in; no text matching. */
export const ENUM_OPERATORS = ["EQUAL", "NOT_EQUAL", "IN", "NOT_IN", "IS_NULL", "IS_NOT_NULL"];

export const OPERATORS_BY_CATEGORY: Record<FieldTypeCategory, string[]> = {
  [FIELD_TYPE_CATEGORY.STRING]: STRING_OPERATORS,
  [FIELD_TYPE_CATEGORY.ARRAY]: ARRAY_OPERATORS,
  [FIELD_TYPE_CATEGORY.NUMERIC]: NUMERIC_OPERATORS,
  [FIELD_TYPE_CATEGORY.BOOLEAN]: BOOLEAN_OPERATORS,
  [FIELD_TYPE_CATEGORY.DATE]: DATE_OPERATORS,
  [FIELD_TYPE_CATEGORY.ENUM]: ENUM_OPERATORS,
};

/** Auth fields that are string type (for right-side filtering when left is array) */
export const AUTH_STRING_FIELDS = AUTH_FIELD_OPTIONS.filter(
  (opt) => opt.category === FIELD_TYPE_CATEGORY.STRING,
);

/** Numeric schema field types */
const NUMERIC_FIELD_TYPES = new Set([
  "int",
  "int32",
  "int64",
  "long",
  "float",
  "double",
  "decimal",
]);

/** Resolve the field type category for a schema field */
export function getFieldTypeCategory(
  type?: string | null,
  isArray?: boolean | null,
): FieldTypeCategory {
  if (isArray) return FIELD_TYPE_CATEGORY.ARRAY;
  const normalized = (type ?? "").toLowerCase();
  if (NUMERIC_FIELD_TYPES.has(normalized)) return FIELD_TYPE_CATEGORY.NUMERIC;
  if (normalized === "boolean" || normalized === "bool") return FIELD_TYPE_CATEGORY.BOOLEAN;
  if (normalized === "datetime" || normalized === "date") return FIELD_TYPE_CATEGORY.DATE;
  if (normalized === "enum") return FIELD_TYPE_CATEGORY.ENUM;
  return FIELD_TYPE_CATEGORY.STRING;
}

export const NUMBER_TO_OPERATOR_LABEL: Record<number, string> = {
  get 0() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.EQUAL"); },
  get 1() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_EQUAL"); },
  get 2() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.GREATER_THAN"); },
  get 3() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.GREATER_THAN_OR_EQUAL"); },
  get 4() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.LESS_THAN"); },
  get 5() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.LESS_THAN_OR_EQUAL"); },
  get 6() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.CONTAIN"); },
  get 7() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_CONTAIN"); },
  get 8() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IN"); },
  get 9() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.NOT_IN"); },
  get 10() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.START_WITH"); },
  get 11() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.END_WITH"); },
  get 12() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NULL"); },
  get 13() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NOT_NULL"); },
  get 14() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.REGEX"); },
};

/** Natural-language operator labels for readable rule text */
export const READABLE_OPERATORS: Record<number, string> = {
  get 0() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.EQUALS"); },
  get 1() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.DOES_NOT_EQUAL"); },
  get 2() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_GREATER_THAN"); },
  get 3() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_GREATER_THAN_OR_EQUAL_TO"); },
  get 4() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_LESS_THAN"); },
  get 5() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_LESS_THAN_OR_EQUAL_TO"); },
  get 6() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.CONTAINS"); },
  get 7() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.DOES_NOT_CONTAIN"); },
  get 8() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_IN"); },
  get 9() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NOT_IN"); },
  get 10() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.STARTS_WITH"); },
  get 11() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.ENDS_WITH"); },
  get 12() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NULL_2"); },
  get 13() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.IS_NOT_NULL_2"); },
  get 14() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.MATCHES_REGEX"); },
};

/** Operator keys that take no right-hand operand */
export const NULL_OPERATORS: string[] = ["IS_NULL", "IS_NOT_NULL"];

/** Operator keys that accept multiple values */
export const IN_OPERATORS: string[] = ["IN", "NOT_IN"];

/** Display labels for the access type selector */
export const ACCESS_TYPE_LABELS: Record<string, string> = {
  get [ACCESS_TYPES.LOGGED_IN]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.ALL_LOGGED_IN_USERS"); },
  get [ACCESS_TYPES.PUBLIC]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.PUBLIC"); },
  get [ACCESS_TYPES.CUSTOM]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.CUSTOM_PERMISSIONS"); },
  get [ACCESS_TYPES.INHERITED]() { return tStatic("data.gateway.access", "SCHEMA_ACCESS_CONTROL.INHERITED"); },
};

/** Map tab id → POLICY_OPERATION number */
export const TAB_TO_OPERATION: Record<string, number> = {
  view: POLICY_OPERATION.READ,
  create: POLICY_OPERATION.CREATE,
  edit: POLICY_OPERATION.UPDATE,
  delete: POLICY_OPERATION.DELETE,
};

/** Map tab id → access-level property key on IField */
export const TAB_TO_ACCESS_LEVEL_KEY: Record<
  string,
  "readAccessLevel" | "writeAccessLevel" | "editAccessLevel" | "deleteAccessLevel"
> = {
  view: "readAccessLevel",
  create: "writeAccessLevel",
  edit: "editAccessLevel",
  delete: "deleteAccessLevel",
};
