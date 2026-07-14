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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NESTING_DEPTH = 6;

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
  if (depth >= MAX_NESTING_DEPTH || visited.has(typeName)) {
    return [`${indent}# ...`];
  }

  const type = typeMap.get(typeName);
  if (!type?.fields) return [];

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

  // For queries, filter out redundant top-level args (e.g. `input` duplicates where/order/paging)
  // For update/updateMany mutations, filter out `filter` (redundant with `where`)
  let args = field.args;
  if (operationType === "query") {
    args = args.filter((a) => !EXCLUDED_QUERY_ARG_NAMES.has(a.name));
  } else if (isFilterExcludedMutation) {
    args = args.filter((a) => !EXCLUDED_MUTATION_FILTER_ARG_NAMES.has(a.name));
  }

  const argLines = args.map((arg) => {
    const val = buildInputValue(arg.type, typeMap, 0, "    ", new Set(), arg.name, isMutationInput);
    return `    ${arg.name}: ${val}`;
  });

  const header =
    args.length > 0 ? [`  ${field.name}(`, argLines.join("\n"), "  ) {"] : [`  ${field.name} {`];

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

  return OPERATION_DESCRIPTORS.flatMap((op) => {
    const rootType = op.type === "query" ? queryRoot : mutationRoot;
    const field = rootType?.fields?.find((f) => f.name === `${op.prefix}${schemaName}${op.suffix}`);
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
