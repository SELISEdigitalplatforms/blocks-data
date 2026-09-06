// ---------------------------------------------------------------------------
// Shared GraphQL query generation from introspection data.
// Used by both `schemas-drawer.tsx` and `schema-preview-drawer.tsx`.
// ---------------------------------------------------------------------------

import {
  COLLAPSIBLE_FILTER_FIELD,
  COLLAPSIBLE_LIST_FIELDS,
  LOGICAL_OPERATOR_FIELDS,
  EXCLUDED_QUERY_ARG_NAMES,
  EXCLUDED_MUTATION_FILTER_ARG_NAMES,
  SYSTEM_INPUT_FIELDS,
  formatGraphQLDateTimeSampleValue,
  getStringDefault,
  getIntDefault,
  getFloatDefault,
  MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES,
} from "./graphql-constants";
import type { TemplateSection } from "../models/schema-preview.types";

const MAX_NESTING_DEPTH = 30;

// ---------------------------------------------------------------------------
// Introspection types
// ---------------------------------------------------------------------------

export interface TypeRef {
  kind: string;
  name: string | null;
  ofType: TypeRef | null;
}

export interface FieldArg {
  name: string;
  description: string | null;
  type: TypeRef;
  defaultValue: string | null;
}

export interface SchemaField {
  name: string;
  description: string | null;
  args: FieldArg[];
  type: TypeRef;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

interface InputField {
  name: string;
  description: string | null;
  type: TypeRef;
  defaultValue: string | null;
}

interface EnumValue {
  name: string;
  description: string | null;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

export interface IntrospectionType {
  kind: string;
  name: string;
  description: string | null;
  fields: SchemaField[] | null;
  inputFields: InputField[] | null;
  interfaces: TypeRef[] | null;
  enumValues: EnumValue[] | null;
  possibleTypes: TypeRef[] | null;
}

export interface IntrospectionSchema {
  queryType: { name: string; kind: string } | null;
  mutationType: { name: string; kind: string } | null;
  subscriptionType: { name: string; kind: string } | null;
  types: IntrospectionType[];
  directives: unknown[];
}

export interface IntrospectionResponse {
  data: {
    __schema: IntrospectionSchema;
  };
}

// ---------------------------------------------------------------------------
// Type resolution helpers
// ---------------------------------------------------------------------------

export function resolveBaseTypeName(typeRef: TypeRef | null): string | null {
  if (!typeRef) return null;
  if (typeRef.kind === "NON_NULL" || typeRef.kind === "LIST")
    return resolveBaseTypeName(typeRef.ofType);
  return typeRef.name;
}

export function resolveTypeName(typeRef: TypeRef | null): string {
  if (!typeRef) return "unknown";
  if (typeRef.kind === "NON_NULL") return `${resolveTypeName(typeRef.ofType)}!`;
  if (typeRef.kind === "LIST") return `[${resolveTypeName(typeRef.ofType)}]`;
  return typeRef.name || "unknown";
}

function isListTypeRef(typeRef: TypeRef | null): boolean {
  if (!typeRef) return false;
  if (typeRef.kind === "NON_NULL") return isListTypeRef(typeRef.ofType);
  return typeRef.kind === "LIST";
}

// ---------------------------------------------------------------------------
// Query generation
// ---------------------------------------------------------------------------

export function buildInputValue(
  typeRef: TypeRef,
  typeMap: Map<string, IntrospectionType>,
  depth: number,
  indent: string,
  visited: Set<string>,
  fieldName?: string,
  isMutationInput?: boolean,
): string {
  const isNonNull = typeRef.kind === "NON_NULL";
  const unwrapped = isNonNull ? typeRef.ofType! : typeRef;
  const isList = unwrapped.kind === "LIST";

  if (isList) {
    if (fieldName && COLLAPSIBLE_LIST_FIELDS.has(fieldName)) return "[]";
    if (fieldName && LOGICAL_OPERATOR_FIELDS.has(fieldName)) return "[{}]";
    const inner = buildInputValue(
      unwrapped.ofType!,
      typeMap,
      depth,
      indent,
      visited,
      fieldName,
      isMutationInput,
    );
    return `[${inner}]`;
  }

  const baseName = resolveBaseTypeName(typeRef);
  if (!baseName) return getStringDefault(fieldName, isMutationInput);

  const type = typeMap.get(baseName);

  // Scalar types (built-in or not found in type map)
  if (!type || type.kind === "SCALAR") {
    if (baseName && MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has(baseName)) {
      return formatGraphQLDateTimeSampleValue();
    }
    switch (baseName) {
      case "Int":
        return getIntDefault(fieldName, isMutationInput);
      case "Float":
        return getFloatDefault(fieldName, isMutationInput);
      case "Boolean":
        return "false";
      default:
        return getStringDefault(fieldName, isMutationInput);
    }
  }

  if (type.kind === "ENUM") {
    const first = type.enumValues?.[0]?.name;
    return first ? `${first}` : '""';
  }

  if (type.kind === "INPUT_OBJECT") {
    if (fieldName === COLLAPSIBLE_FILTER_FIELD) return "{}";
    // GraphQL input types can be recursive. Expand every acyclic level and
    // terminate only an actual cycle so deeply nested DTOs are not truncated.
    if (depth >= MAX_NESTING_DEPTH || visited.has(baseName)) return "{}";

    const nextVisited = new Set(visited).add(baseName);
    let fields = type.inputFields ?? [];
    if (isMutationInput) {
      fields = fields.filter((f) => !SYSTEM_INPUT_FIELDS.has(f.name));
    }
    if (fields.length === 0) return "{}";

    const innerIndent = indent + "  ";
    const lines = fields.map((f) => {
      const val = buildInputValue(
        f.type,
        typeMap,
        depth + 1,
        innerIndent,
        nextVisited,
        f.name,
        isMutationInput,
      );
      return `${innerIndent}${f.name}: ${val}`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }

  return getStringDefault(fieldName, isMutationInput);
}

export function buildSelectionSet(
  typeName: string,
  typeMap: Map<string, IntrospectionType>,
  depth: number,
  indent: string,
  visited: Set<string>,
): string[] {
  // A recursive output type cannot be expanded infinitely. __typename is a
  // real field on every object and keeps the generated selection executable.
  if (depth >= MAX_NESTING_DEPTH || visited.has(typeName)) {
    return [`${indent}__typename`];
  }

  const type = typeMap.get(typeName);
  if (!type?.fields?.length) return [`${indent}__typename`];

  const nextVisited = new Set(visited).add(typeName);

  // Preferred order for result type fields
  const preferredOrder = [
    "items",
    "totalCount",
    "pageNo",
    "pageSize",
    "totalPages",
    "hasNextPage",
    "hasPreviousPage",
  ];
  const sortedFields = [...type.fields].sort((a, b) => {
    const idxA = preferredOrder.indexOf(a.name);
    const idxB = preferredOrder.indexOf(b.name);

    // If both are in preferred list, follow that order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // If only one is in preferred list, it comes first
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    // Otherwise maintain original order
    return 0;
  });

  const lines: string[] = [];

  for (const field of sortedFields) {
    const baseName = resolveBaseTypeName(field.type);
    const childType = baseName ? typeMap.get(baseName) : null;

    if (childType?.kind === "OBJECT") {
      lines.push(`${indent}${field.name} {`);
      lines.push(...buildSelectionSet(baseName!, typeMap, depth + 1, indent + "  ", nextVisited));
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}${field.name}`);
    }
  }

  return lines;
}

export function generateGraphQLQuery(
  field: SchemaField,
  typeMap: Map<string, IntrospectionType>,
  operationType: "query" | "mutation",
): string {
  const isMutationInput =
    operationType === "mutation" &&
    (field.name.startsWith("insert") || field.name.startsWith("update"));

  const isFilterExcludedMutation =
    operationType === "mutation" &&
    (field.name.startsWith("update") || field.name.startsWith("delete"));

  // Detect a legacy `input` arg (filter/sort/pageNo/pageSize) on queries.
  // When modern top-level args (where/order/paging) are also present, prefer
  // them and skip the legacy expansion to avoid duplicating where/order/paging.
  const legacyInputArg = field.args.find((a) => a.name === "input");
  const legacyInputType = legacyInputArg
    ? typeMap.get(resolveBaseTypeName(legacyInputArg.type) || "")
    : undefined;
  const legacyInputFields =
    legacyInputType?.kind === "INPUT_OBJECT" ? (legacyInputType.inputFields ?? []) : [];
  const hasModernTopLevelArgs = field.args.some(
    (a) => a.name === "where" || a.name === "order" || a.name === "paging",
  );
  const hasLegacyInput =
    operationType === "query" &&
    !!legacyInputArg &&
    !hasModernTopLevelArgs &&
    legacyInputFields.some(
      (f) =>
        f.name === "filter" || f.name === "sort" || f.name === "pageNo" || f.name === "pageSize",
    );
  const legacyTopLevelFieldNames = new Set<string>(
    hasLegacyInput
      ? legacyInputFields
          .filter((f) => ["filter", "sort", "pageNo", "pageSize"].includes(f.name))
          .map((f) => f.name)
      : [],
  );

  // For queries, filter out redundant top-level args (e.g. `input` duplicates where/order/paging)
  // For update/updateMany mutations, filter out `filter` (redundant with `where`)
  let args = field.args;
  if (operationType === "query") {
    args = args.filter(
      (a) => !EXCLUDED_QUERY_ARG_NAMES.has(a.name) && !legacyTopLevelFieldNames.has(a.name),
    );
  } else if (isFilterExcludedMutation) {
    args = args.filter((a) => !EXCLUDED_MUTATION_FILTER_ARG_NAMES.has(a.name));
  }

  // Normalize legacy `input` arg (filter/sort/pageNo/pageSize) into where/order/paging
  // when the introspection has not yet been migrated to the new arg layout.
  args = args.map((arg) => {
    if (operationType === "query" && arg.name === "input") {
      return { ...arg, name: "__legacy_input__" };
    }
    if (operationType === "mutation" && arg.name === "filter") {
      return { ...arg, name: "where" };
    }
    return arg;
  });

  const argLines: string[] = [];

  if (hasLegacyInput && legacyInputArg) {
    const whereField = legacyInputFields.find((f) => f.name === "filter");
    const orderField = legacyInputFields.find((f) => f.name === "sort");
    const pageNoField = legacyInputFields.find((f) => f.name === "pageNo");
    const pageSizeField = legacyInputFields.find((f) => f.name === "pageSize");

    if (whereField) {
      const val = buildInputValue(
        whereField.type,
        typeMap,
        0,
        "    ",
        new Set(),
        "where",
        isMutationInput,
      );
      argLines.push(`    where: ${val}`);
    }
    if (orderField) {
      const val = buildInputValue(
        orderField.type,
        typeMap,
        0,
        "    ",
        new Set(),
        "order",
        isMutationInput,
      );
      argLines.push(`    order: ${val}`);
    }
    if (pageNoField || pageSizeField) {
      const pagingLines: string[] = [];
      if (pageNoField) {
        const val = buildInputValue(
          pageNoField.type,
          typeMap,
          1,
          "      ",
          new Set(),
          "pageNo",
          isMutationInput,
        );
        pagingLines.push(`      pageNo: ${val}`);
      }
      if (pageSizeField) {
        const val = buildInputValue(
          pageSizeField.type,
          typeMap,
          1,
          "      ",
          new Set(),
          "pageSize",
          isMutationInput,
        );
        pagingLines.push(`      pageSize: ${val}`);
      }
      argLines.push(`    paging: {\n${pagingLines.join("\n")}\n    }`);
    }
  }

  args.forEach((arg) => {
    if (arg.name === "__legacy_input__") return;
    const val = buildInputValue(arg.type, typeMap, 0, "    ", new Set(), arg.name, isMutationInput);
    argLines.push(`    ${arg.name}: ${val}`);
  });

  const header =
    argLines.length > 0
      ? [`  ${field.name}(`, argLines.join("\n"), "  ) {"]
      : [`  ${field.name} {`];

  const returnBase = resolveBaseTypeName(field.type);
  const selectionLines = returnBase
    ? buildSelectionSet(returnBase, typeMap, 0, "    ", new Set())
    : [];

  return [`${operationType} {`, ...header, ...selectionLines, "  }", "}"].join("\n");
}

// ---------------------------------------------------------------------------
// Type map builder
// ---------------------------------------------------------------------------

function buildTypeMap(response: IntrospectionResponse): Map<string, IntrospectionType> {
  const map = new Map<string, IntrospectionType>();
  for (const type of response.data.__schema.types) {
    map.set(type.name, type);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Preview section builder — generates CRUD sections for a schema
// ---------------------------------------------------------------------------

interface OperationDescriptor {
  title: string;
  description: string;
  prefix: string;
  suffix: string;
  type: "query" | "mutation";
}

const OPERATION_DESCRIPTORS: OperationDescriptor[] = [
  {
    title: "Query",
    description: "Fetch data from the schema",
    prefix: "get",
    suffix: "s",
    type: "query",
  },
  {
    title: "Insert",
    description: "Add new entries to the schema",
    prefix: "insert",
    suffix: "",
    type: "mutation",
  },
  {
    title: "Insert Many",
    description: "Add multiple entries at once",
    prefix: "insertMany",
    suffix: "",
    type: "mutation",
  },
  {
    title: "Update",
    description: "Modify existing entries",
    prefix: "update",
    suffix: "",
    type: "mutation",
  },
  {
    title: "Update Many",
    description: "Modify multiple entries at once",
    prefix: "updateMany",
    suffix: "",
    type: "mutation",
  },
  {
    title: "Delete",
    description: "Remove entries from the schema",
    prefix: "delete",
    suffix: "",
    type: "mutation",
  },
  {
    title: "Delete Many",
    description: "Remove multiple entries from the schema",
    prefix: "deleteMany",
    suffix: "",
    type: "mutation",
  },
];

/**
 * Build preview sections for a schema using raw introspection data.
 * Discovers CRUD operations by naming convention and generates exact
 * queries from the real GraphQL schema. Sections with no matching
 * operation in the schema are automatically omitted.
 */
export function buildPreviewSections(
  rawIntrospection: unknown,
  schemaName: string,
): TemplateSection[] {
  const response = rawIntrospection as IntrospectionResponse;
  if (!response?.data?.__schema) return [];

  const { queryType, mutationType } = response.data.__schema;
  const typeMap = buildTypeMap(response);

  const queryRoot = queryType?.name ? typeMap.get(queryType.name) : null;
  const mutationRoot = mutationType?.name ? typeMap.get(mutationType.name) : null;

  const candidatesForOp = (op: OperationDescriptor): string[] => {
    const names = [schemaName, schemaName.toLowerCase()];
    const suffixes = [op.suffix, ""];
    const out: string[] = [];
    for (const n of names) {
      for (const s of suffixes) {
        out.push(`${op.prefix}${n}${s}`);
      }
    }
    return out;
  };

  const findField = (
    rootType: IntrospectionType | null | undefined,
    candidates: string[],
  ): SchemaField | undefined => {
    if (!rootType?.fields) return undefined;
    const lowered = candidates.map((c) => c.toLowerCase());
    for (const candidate of candidates) {
      const found = rootType.fields.find((f) => f.name === candidate);
      if (found) return found as SchemaField;
    }
    for (const candidate of lowered) {
      const found = rootType.fields.find((f) => f.name.toLowerCase() === candidate);
      if (found) return found as SchemaField;
    }
    return undefined;
  };

  return OPERATION_DESCRIPTORS.flatMap((op) => {
    const rootType = op.type === "query" ? queryRoot : mutationRoot;
    const field = findField(rootType, candidatesForOp(op));
    if (!field) return [];

    return [
      {
        title: op.title,
        description: op.description,
        code: generateGraphQLQuery(field, typeMap, op.type),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Schema-structure preview JSON
// ---------------------------------------------------------------------------

/** Maps introspection scalar names to the preview placeholders used in
 *  `PREVIEW_TYPE_MAP` (schema-structure.types.ts). Unknown scalars fall back
 *  to a lowercase version of their name. */
const INTROSPECTION_SCALAR_PREVIEW: Record<string, string> = {
  String: "string",
  Int: "integer",
  Integer: "integer",
  Long: "long",
  Float: "float",
  Boolean: "boolean",
  DateTime: "datetime",
  Date: "datetime",
  DateTimeOffset: "datetime",
  JSON: "string",
};

const previewForScalar = (name: string | null): string => {
  if (!name) return "string";
  return INTROSPECTION_SCALAR_PREVIEW[name] ?? name.toLowerCase();
};

/** Find the most appropriate GraphQL type for a schema by name. Preference:
 *  1) exact OBJECT / INPUT_OBJECT name match (case-insensitive),
 *  2) INPUT_OBJECT with `${schemaName}Input` suffix,
 *  3) OBJECT with the same suffix. */
const findSchemaType = (
  typeMap: Map<string, IntrospectionType>,
  schemaName: string,
): IntrospectionType | null => {
  if (!schemaName) return null;
  const target = schemaName.trim().toLowerCase();

  const candidates = Array.from(typeMap.values()).filter(
    (t) =>
      (t.kind === "OBJECT" || t.kind === "INPUT_OBJECT") &&
      typeof t.name === "string" &&
      t.name.toLowerCase() === target,
  );
  if (candidates.length > 0) return candidates[0];

  const inputName = `${schemaName}Input`;
  const inputMatch = Array.from(typeMap.values()).find(
    (t) =>
      t.kind === "INPUT_OBJECT" &&
      typeof t.name === "string" &&
      t.name.toLowerCase() === inputName.toLowerCase(),
  );
  if (inputMatch) return inputMatch;

  return null;
};

const buildPreviewValue = (
  typeRef: TypeRef | null,
  typeMap: Map<string, IntrospectionType>,
  depth: number,
  visited: Set<string>,
): unknown => {
  if (!typeRef) return "";

  if (depth >= MAX_NESTING_DEPTH) {
    const baseName = resolveBaseTypeName(typeRef);
    const resolved = baseName ? typeMap.get(baseName) : undefined;
    const terminalValue =
      resolved?.kind === "OBJECT" || resolved?.kind === "INPUT_OBJECT"
        ? {}
        : previewForScalar(baseName);
    return isListTypeRef(typeRef) ? [terminalValue] : terminalValue;
  }

  if (typeRef.kind === "NON_NULL") {
    return buildPreviewValue(typeRef.ofType, typeMap, depth, visited);
  }
  if (typeRef.kind === "LIST") {
    const inner = buildPreviewValue(typeRef.ofType, typeMap, depth + 1, visited);
    return [inner];
  }

  const baseName = typeRef.name;
  if (!baseName) return "";

  const resolved = typeMap.get(baseName);
  if (!resolved || resolved.kind === "SCALAR") {
    return previewForScalar(baseName);
  }

  if (resolved.kind === "ENUM") {
    const first = resolved.enumValues?.[0]?.name;
    return first ? first.toLowerCase() : "string";
  }

  if (resolved.kind === "OBJECT" || resolved.kind === "INPUT_OBJECT") {
    if (visited.has(baseName)) return {};
    const nextVisited = new Set(visited).add(baseName);
    const fields =
      resolved.kind === "INPUT_OBJECT" ? (resolved.inputFields ?? []) : (resolved.fields ?? []);
    const result: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (!f?.name) return;
      result[f.name] = buildPreviewValue(f.type, typeMap, depth + 1, nextVisited);
    });
    return result;
  }

  return previewForScalar(baseName);
};

/**
 * Build a JSON preview object that mirrors a schema record by walking the
 * GraphQL types returned from the `/gateway` introspection query.
 *
 * The function prefers the exact `${schemaName}` type and falls back to
 * `${schemaName}Input` when the schema does not have a direct OBJECT/INPUT
 * representation in the introspection. Returns `null` when the schema cannot
 * be resolved, so callers can fall back to local preview-map generation.
 */
export function buildPreviewJsonFromIntrospection(
  rawIntrospection: unknown,
  schemaName: string,
): Record<string, unknown> | null {
  const response = rawIntrospection as IntrospectionResponse | undefined;
  if (!response?.data?.__schema || !schemaName) return null;

  const typeMap = buildTypeMap(response);
  const rootType = findSchemaType(typeMap, schemaName);
  if (!rootType) return null;

  const fields =
    rootType.kind === "INPUT_OBJECT" ? (rootType.inputFields ?? []) : (rootType.fields ?? []);
  if (fields.length === 0) return {};

  const preview: Record<string, unknown> = {};
  fields.forEach((f) => {
    if (!f?.name) return;
    preview[f.name] = buildPreviewValue(f.type, typeMap, 0, new Set());
  });

  return preview;
}
