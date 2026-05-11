import type {
  GraphQLSchema,
  GraphQLType,
  GraphQLField,
  GraphQLArgument,
  GraphQLNamedType,
  GraphQLInputObjectType,
} from "graphql";
import {
  isObjectType,
  isInputObjectType,
  isEnumType,
  isListType,
  isNonNullType,
  isScalarType,
} from "graphql";
import {
  KNOWN_ARG_COMMENTS,
  COLLAPSIBLE_FILTER_FIELD,
  COLLAPSIBLE_LIST_FIELDS,
  EXCLUDED_QUERY_ARG_NAMES,
  EXCLUDED_MUTATION_FILTER_ARG_NAMES,
  EXCLUDED_INPUT_SUBFIELDS,
  SYSTEM_INPUT_FIELDS,
  MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES,
  formatGraphQLDateTimeSampleValue,
  mongoStringLiteralForField,
  paginationDefaultForField,
} from "./graphql-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A framework-agnostic completion suggestion.
 * Mapped to Monaco CompletionItem in the playground component.
 */
export interface IntrospectionSuggestion {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  isSnippet: boolean;
  kind: "function" | "field" | "keyword" | "enum" | "class" | "variable";
  sortText?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * When walking backward to a `{` that opens an object/input block, the prelude is
 * `fieldName:` possibly followed by spaces or newlines before `{`.
 * A raw `/(\w+):\s*$/` on the substring before `{` fails for `input:\n  {`.
 */
export function resolveFieldNameBeforeOpeningBrace(beforeBraceText: string): string | null {
  const trimmed = beforeBraceText.replace(/[\s\u00a0]+$/g, "");
  const match = trimmed.match(/(\w+)\s*:\s*$/);
  return match ? match[1] : null;
}

/**
 * Unwrap NonNull / List wrappers and return a human-readable type string.
 * e.g. NonNull(List(NonNull(String))) → "String!"  (list notation: "[String!]!")
 */
export const resolveTypeString = (type: GraphQLType): string => {
  if (isNonNullType(type)) {
    return `${resolveTypeString(type.ofType)}!`;
  }
  if (isListType(type)) {
    return `[${resolveTypeString(type.ofType)}]`;
  }
  return (type as GraphQLNamedType).name;
};

/**
 * Get the underlying named type by stripping wrappers (NonNull / List).
 */
const getNamedType = (type: GraphQLType): GraphQLNamedType => {
  if (isNonNullType(type) || isListType(type)) {
    return getNamedType(type.ofType);
  }
  return type as GraphQLNamedType;
};

/**
 * Check if the type is a list or a list wrapped in NonNull.
 */
const isDeepListType = (type: GraphQLType): boolean => {
  if (isNonNullType(type)) {
    return isDeepListType(type.ofType);
  }
  return isListType(type);
};

/**
 * Recursively build sample lines for a nested input object (mutation `input` block).
 * Expands list-of-input-object to `[{ ... }]` instead of `[]`.
 */
const buildInputObjectSampleLines = (
  inputType: GraphQLInputObjectType,
  lineIndent: string,
  useSampleValues: boolean,
  tabStopBase: number,
): string => {
  const fields = Object.values(inputType.getFields());
  return fields
    .map((f, fi) => buildNestedInputFieldLine(f, lineIndent, useSampleValues, tabStopBase + fi))
    .join("\n");
};

const buildNestedInputFieldLine = (
  f: { name: string; type: GraphQLType },
  lineIndent: string,
  useSampleValues: boolean,
  fStop: number,
): string => {
  const fType = resolveTypeString(f.type);
  const fNamed = getNamedType(f.type);
  const fComment = KNOWN_ARG_COMMENTS[f.name] ? `  ${KNOWN_ARG_COMMENTS[f.name]}` : "";
  const fIsList = isDeepListType(f.type);

  if (f.name === COLLAPSIBLE_FILTER_FIELD && isInputObjectType(fNamed)) {
    return `${lineIndent}${f.name}: {}`;
  }

  if (COLLAPSIBLE_LIST_FIELDS.has(f.name) && fIsList) {
    return `${lineIndent}${f.name}: []`;
  }

  if (fIsList && isInputObjectType(fNamed)) {
    const innerIndent = lineIndent + "  ";
    const innerBody = buildInputObjectSampleLines(fNamed, innerIndent, useSampleValues, fStop);
    return `${lineIndent}${f.name}: [{\n${innerBody}\n${lineIndent}}]${fComment}`;
  }

  if (!fIsList && isInputObjectType(fNamed)) {
    const innerIndent = lineIndent + "  ";
    const innerBody = buildInputObjectSampleLines(fNamed, innerIndent, useSampleValues, fStop);
    return `${lineIndent}${f.name}: {\n${innerBody}\n${lineIndent}}${fComment}`;
  }

  if (!useSampleValues) {
    return `${lineIndent}${f.name}: \${${fStop}}${fComment}`;
  }

  if (isScalarType(fNamed) && (fNamed.name === "String" || fNamed.name === "JSON")) {
    const mongoLit = mongoStringLiteralForField(f.name, fIsList);
    if (mongoLit !== null) {
      const litWithCursor = mongoLit.replace('[""]', '["${1}"]').replace('"{}"', '"{\${1}}"');
      return `${lineIndent}${f.name}: ${litWithCursor}${fComment}`;
    }
    return fIsList
      ? `${lineIndent}${f.name}: ["Sample text"]${fComment}`
      : `${lineIndent}${f.name}: "Sample text"${fComment}`;
  }

  if (
    !fIsList &&
    isScalarType(fNamed) &&
    MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has(fNamed.name)
  ) {
    return `${lineIndent}${f.name}: ${formatGraphQLDateTimeSampleValue()}${fComment}`;
  }
  if (
    fIsList &&
    isScalarType(fNamed) &&
    MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has(fNamed.name)
  ) {
    return `${lineIndent}${f.name}: [${formatGraphQLDateTimeSampleValue()}]${fComment}`;
  }

  if (fType.includes("Int") || fType.includes("Float")) {
    const pageDef = paginationDefaultForField(f.name, fIsList);
    if (pageDef !== null) {
      return `${lineIndent}${f.name}: ${pageDef}${fComment}`;
    }
    return fType.includes("Float")
      ? `${lineIndent}${f.name}: 1.0${fComment}`
      : `${lineIndent}${f.name}: 1${fComment}`;
  }
  if (isEnumType(fNamed)) {
    const vals = fNamed.getValues().map((v) => v.name);
    return `${lineIndent}${f.name}: ${vals[0] || '""'}${fComment}`;
  }
  if (fType.includes("Boolean")) {
    return `${lineIndent}${f.name}: false${fComment}`;
  }
  if (fIsList) {
    return `${lineIndent}${f.name}: []${fComment}`;
  }
  return `${lineIndent}${f.name}: \${${fStop}}${fComment}`;
};

/**
 * Build an argument snippet string for a GraphQL field.
 * Collapses where → {}, order → [], uses 1/10 for pageNo/pageSize.
 * Appends inline comments for well-known arg names (filter, sort).
 *
 * For update/updateMany mutations, `filter` is excluded and `input`
 * is expanded with the actual schema fields.
 */
const buildArgumentSnippet = (
  args: readonly GraphQLArgument[],
  operationType?: "query" | "mutation",
  fieldName?: string,
): string => {
  const isFilterExcludedMutation =
    operationType === "mutation" &&
    !!fieldName &&
    (fieldName.startsWith("update") || fieldName.startsWith("delete"));

  const isMutationInput =
    operationType === "mutation" &&
    !!fieldName &&
    (fieldName.startsWith("insert") || fieldName.startsWith("update"));

  // For queries: exclude `input` (list queries expose where/order/paging instead).
  // For update/delete mutations: exclude redundant string `filter` when `where` exists.
  // For other mutations: keep all args including `input`.
  let filteredArgs: readonly GraphQLArgument[];
  if (isFilterExcludedMutation) {
    filteredArgs = args.filter((a) => !EXCLUDED_MUTATION_FILTER_ARG_NAMES.has(a.name));
  } else if (operationType === "query") {
    filteredArgs = args.filter((a) => !EXCLUDED_QUERY_ARG_NAMES.has(a.name));
  } else {
    filteredArgs = args;
  }
  if (filteredArgs.length === 0) return "";

  const parts = filteredArgs.map((arg, i) => {
    const typeStr = resolveTypeString(arg.type);
    const namedType = getNamedType(arg.type);
    const tabStop = i + 1;
    const comment = KNOWN_ARG_COMMENTS[arg.name] ? `  ${KNOWN_ARG_COMMENTS[arg.name]}` : "";

    // Collapse list-typed args like `order` to empty array
    if (COLLAPSIBLE_LIST_FIELDS.has(arg.name) && isDeepListType(arg.type)) {
      return `${arg.name}: []`;
    }

    // For input object types, provide a nested snippet
    if (isInputObjectType(namedType)) {
      // Collapse filter/where inputs to empty object
      if (arg.name === COLLAPSIBLE_FILTER_FIELD) {
        return `${arg.name}: {}`;
      }

      const argIsList = isDeepListType(arg.type);
      let fields = Object.values(namedType.getFields());

      // For mutation input args on insert/update, filter out system fields
      if (isMutationInput && arg.name === "input") {
        fields = fields.filter((f) => !SYSTEM_INPUT_FIELDS.has(f.name));
      }

      // Use sample values for mutation input fields, tab stops for others
      const useSampleValues = isMutationInput && arg.name === "input";

      const fieldLines = fields.map((f, fi) => {
        const fStop = tabStop + fi;
        if (useSampleValues) {
          return buildNestedInputFieldLine(f, "    ", true, fStop);
        }

        const fType = resolveTypeString(f.type);
        const fNamed = getNamedType(f.type);
        const fComment = KNOWN_ARG_COMMENTS[f.name] ? `  ${KNOWN_ARG_COMMENTS[f.name]}` : "";
        const fIsList = isDeepListType(f.type);

        // Collapse where sub-field to empty object
        if (f.name === COLLAPSIBLE_FILTER_FIELD && isInputObjectType(fNamed)) {
          return `    ${f.name}: {}`;
        }

        // Collapse order sub-field to empty array
        if (COLLAPSIBLE_LIST_FIELDS.has(f.name) && fIsList) {
          return `    ${f.name}: []`;
        }

        if (isScalarType(fNamed) && (fNamed.name === "String" || fNamed.name === "JSON")) {
          const mongoLit = mongoStringLiteralForField(f.name, fIsList);
          if (mongoLit !== null) {
            const litWithCursor = mongoLit.replace('[""]', '["${1}"]').replace('"{}"', '"{\${1}}"');
            return `    ${f.name}: ${litWithCursor}${fComment}`;
          }
          if (fIsList) return `    ${f.name}: ["\${${fStop}}"]${fComment}`;
          return `    ${f.name}: "\${${fStop}}"${fComment}`;
        }
        if (fType.includes("Int") || fType.includes("Float")) {
          const pageDef = paginationDefaultForField(f.name, fIsList);
          if (pageDef !== null) {
            return `    ${f.name}: ${pageDef}${fComment}`;
          }
          return `    ${f.name}: \${${fStop}:0}${fComment}`;
        }
        if (isEnumType(fNamed)) {
          const vals = fNamed.getValues().map((v) => v.name);
          return `    ${f.name}: \${${fStop}|${vals.join(",")}|}${fComment}`;
        }
        if (fType.includes("Boolean")) {
          return `    ${f.name}: \${${fStop}|true,false|}${fComment}`;
        }
        if (fIsList) return `    ${f.name}: []${fComment}`;
        return `    ${f.name}: \${${fStop}}${fComment}`;
      });
      const bracketOpen = argIsList ? "[{" : "{";
      const bracketClose = argIsList ? "}]" : "}";
      return `${arg.name}: ${bracketOpen}\n${fieldLines.join("\n")}\n  ${bracketClose}`;
    }

    // For string-like types, wrap in quotes
    if (isScalarType(namedType) && (namedType.name === "String" || namedType.name === "JSON")) {
      const mongoLit = mongoStringLiteralForField(arg.name, isListType(arg.type));
      if (mongoLit !== null) {
        return `${arg.name}: ${mongoLit}${comment}`;
      }
      return `${arg.name}: "\${${tabStop}}"${comment}`;
    }

    // For enums, add type hint in placeholder
    if (isEnumType(namedType)) {
      const values = namedType.getValues().map((v) => v.name);
      return `${arg.name}: \${${tabStop}|${values.join(",")}|}${comment}`;
    }

    if (typeStr.includes("Int") || typeStr.includes("Float")) {
      const pageDef = paginationDefaultForField(arg.name, isListType(arg.type));
      if (pageDef !== null) {
        return `${arg.name}: ${pageDef}${comment}`;
      }
      return `${arg.name}: \${${tabStop}:0}${comment}`;
    }
    if (typeStr.includes("Boolean")) {
      return `${arg.name}: \${${tabStop}|true,false|}${comment}`;
    }

    return `${arg.name}: \${${tabStop}}${comment}`;
  });

  return `(\n  ${parts.join("\n  ")}\n)`;
};

/** Max nesting depth for object field blocks in generated selection snippets (0 = root return type). */
const MAX_FIELD_SNIPPET_DEPTH = 4;

/** Pagination mirrors of input args; keep them in result selection snippets. */
export const OMIT_PAGINATION_MIRROR_SELECTION_FIELDS = new Set<string>([]);

/**
 * Build a default field selection snippet for an object type.
 * Recurses up to nested objects through depth 4 (e.g. Result → items → nested objects → deeper selections).
 */
const buildFieldSelectionSnippet = (
  type: GraphQLNamedType,
  indent: string = "  ",
  depth: number = 0,
): string => {
  if (!isObjectType(type) || depth > MAX_FIELD_SNIPPET_DEPTH) return "";

  const fields = Object.values(type.getFields());

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
  const sortedFields = [...fields].sort((a, b) => {
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
    if (depth === 0 && OMIT_PAGINATION_MIRROR_SELECTION_FIELDS.has(field.name)) continue;

    const namedType = getNamedType(field.type);

    if (isObjectType(namedType) && depth < MAX_FIELD_SNIPPET_DEPTH) {
      // Recurse for nested objects (list element types unwrap to named object)
      const nested = buildFieldSelectionSnippet(namedType, indent + "  ", depth + 1);
      if (nested) {
        lines.push(`${indent}${field.name} {`);
        lines.push(nested);
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}${field.name}`);
      }
    } else {
      lines.push(`${indent}${field.name}`);
    }
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all top-level Query fields as completion suggestions.
 */
export const getQuerySuggestions = (schema: GraphQLSchema): IntrospectionSuggestion[] => {
  const queryType = schema.getQueryType();
  if (!queryType) return [];

  return Object.values(queryType.getFields()).map((field) => {
    const returnType = getNamedType(field.type);
    const argSnippet = buildArgumentSnippet(field.args, "query", field.name);
    const fieldSelection = isObjectType(returnType)
      ? ` {\n${buildFieldSelectionSnippet(returnType, "    ")}\n  }`
      : "";

    return {
      label: field.name,
      detail: `Query → ${resolveTypeString(field.type)}`,
      documentation: field.description || `Query: ${field.name}`,
      insertText: `${field.name}${argSnippet}${fieldSelection}`,
      isSnippet: true,
      kind: "function" as const,
      sortText: `0_${field.name}`,
    };
  });
};

/**
 * Extract all top-level Mutation fields as completion suggestions.
 */
export const getMutationSuggestions = (schema: GraphQLSchema): IntrospectionSuggestion[] => {
  const mutationType = schema.getMutationType();
  if (!mutationType) return [];

  return Object.values(mutationType.getFields()).map((field) => {
    const returnType = getNamedType(field.type);
    const argSnippet = buildArgumentSnippet(field.args, "mutation", field.name);
    const fieldSelection = isObjectType(returnType)
      ? ` {\n${buildFieldSelectionSnippet(returnType, "    ")}\n  }`
      : "";

    return {
      label: field.name,
      detail: `Mutation → ${resolveTypeString(field.type)}`,
      documentation: field.description || `Mutation: ${field.name}`,
      insertText: `${field.name}${argSnippet}${fieldSelection}`,
      isSnippet: true,
      kind: "function" as const,
      sortText: `0_${field.name}`,
    };
  });
};

export type GetFieldSuggestionsOptions = {
  /** When true, omit `pageNo` / `pageSize` (input mirrors on paginated result types). */
  omitPaginationMirrorFields?: boolean;
};

/**
 * Get field-level suggestions for a named type (used inside selection sets).
 */
export const getFieldSuggestions = (
  typeName: string,
  schema: GraphQLSchema,
  options?: GetFieldSuggestionsOptions,
): IntrospectionSuggestion[] => {
  const type = schema.getType(typeName);
  if (!type || !isObjectType(type)) return [];

  const omitPagination = options?.omitPaginationMirrorFields === true;

  return Object.values(type.getFields())
    .filter((field) => {
      if (omitPagination && OMIT_PAGINATION_MIRROR_SELECTION_FIELDS.has(field.name)) return false;
      return true;
    })
    .map((field) => {
      const namedType = getNamedType(field.type);
      const isNestedObject = isObjectType(namedType);

      let insertText: string;
      if (isNestedObject) {
        const nested = buildFieldSelectionSnippet(namedType, "  ", 0);
        insertText = nested ? `${field.name} {\n${nested}\n}` : field.name;
      } else {
        insertText = field.name;
      }

      return {
        label: field.name,
        detail: resolveTypeString(field.type),
        documentation: field.description || `Field: ${field.name}`,
        insertText,
        isSnippet: isNestedObject,
        kind: isNestedObject ? ("class" as const) : ("field" as const),
        sortText: `0_${field.name}`,
      };
    });
};

/**
 * Get argument suggestions for a specific field on a parent type.
 * Useful when the cursor is inside the argument parentheses of a query/mutation.
 */
export const getArgumentSuggestions = (
  fieldName: string,
  parentTypeName: "Query" | "Mutation",
  schema: GraphQLSchema,
): IntrospectionSuggestion[] => {
  const parentType = parentTypeName === "Query" ? schema.getQueryType() : schema.getMutationType();

  if (!parentType) return [];

  const field = parentType.getFields()[fieldName] as GraphQLField<unknown, unknown> | undefined;

  if (!field) return [];

  const isFilterExcludedMutation =
    parentTypeName === "Mutation" &&
    (fieldName.startsWith("update") || fieldName.startsWith("delete"));

  const isMutationInput =
    parentTypeName === "Mutation" &&
    (fieldName.startsWith("insert") || fieldName.startsWith("update"));

  // Filter out args based on operation type
  const filteredFieldArgs = isFilterExcludedMutation
    ? field.args.filter((a) => !EXCLUDED_MUTATION_FILTER_ARG_NAMES.has(a.name))
    : field.args;

  return filteredFieldArgs.map((arg) => {
    const typeStr = resolveTypeString(arg.type);
    const namedType = getNamedType(arg.type);

    let insertText: string;
    let isSnippet = false;

    if (isInputObjectType(namedType)) {
      // For mutation input args (insert/update), expand with actual schema fields
      if (isMutationInput && arg.name === "input") {
        let fields = Object.values(namedType.getFields());
        fields = fields.filter((f) => !SYSTEM_INPUT_FIELDS.has(f.name));

        if (fields.length > 0) {
          const fieldLines = fields.map((f, fi) =>
            buildNestedInputFieldLine(f, "  ", true, fi + 1),
          );
          insertText = `${arg.name}: {\n${fieldLines.join("\n")}\n}`;
        } else {
          insertText = `${arg.name}: {\n  \${1}\n}`;
        }
        isSnippet = true;
        return {
          label: arg.name,
          detail: typeStr,
          documentation: arg.description || `Argument: ${arg.name} (${typeStr})`,
          insertText,
          isSnippet,
          kind: "variable" as const,
          sortText: `000_input`,
        };
      }

      // Collapse filter/where inputs to empty object
      if (arg.name === COLLAPSIBLE_FILTER_FIELD) {
        insertText = `${arg.name}: {}`;
      } else {
        insertText = `${arg.name}: {\n  \${1}\n}`;
      }
      isSnippet = true;
    } else if (
      isScalarType(namedType) &&
      (namedType.name === "String" || namedType.name === "JSON")
    ) {
      insertText = `${arg.name}: "\${1}"`;
      isSnippet = true;
    } else if (isEnumType(namedType)) {
      const values = namedType.getValues().map((v) => v.name);
      insertText = `${arg.name}: \${1|${values.join(",")}|}`;
      isSnippet = true;
    } else {
      insertText = `${arg.name}: \${1}`;
      isSnippet = true;
    }

    return {
      label: arg.name,
      detail: typeStr,
      documentation: arg.description || `Argument: ${arg.name} (${typeStr})`,
      insertText,
      isSnippet,
      kind: "field" as const,
      sortText: `0_${arg.name}`,
    };
  });
};

/**
 * Get input object field suggestions for a named input type.
 * Used when the cursor is inside an input object argument block.
 */
export const getInputFieldSuggestions = (
  typeName: string,
  schema: GraphQLSchema,
): IntrospectionSuggestion[] => {
  const type = schema.getType(typeName);
  if (!type || !isInputObjectType(type)) return [];

  return Object.values(type.getFields())
    .filter((field) => !EXCLUDED_INPUT_SUBFIELDS.has(field.name))
    .map((field) => {
      const typeStr = resolveTypeString(field.type);
      const namedType = getNamedType(field.type);
      const fIsList = isDeepListType(field.type);

      let insertText: string;
      let isSnippet = false;

      if (isInputObjectType(namedType)) {
        insertText = `${field.name}: {\n  \${1}\n}`;
        isSnippet = true;
      } else if (
        isScalarType(namedType) &&
        (namedType.name === "String" || namedType.name === "JSON")
      ) {
        const mongoLit = mongoStringLiteralForField(field.name, fIsList);
        if (mongoLit !== null) {
          // For snippets, place a cursor inside the quotes
          const litWithCursor = mongoLit.replace('[""]', '["${1}"]').replace('"{}"', '"{\${1}}"');
          // Automatically add a newline after filter/sort to prepare for the next field
          insertText = `${field.name}: ${litWithCursor}\n$0`;
        } else {
          insertText = fIsList ? `${field.name}: ["\${1}"]` : `${field.name}: "\${1}"`;
        }
        isSnippet = true;
      } else if (
        isScalarType(namedType) &&
        MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has(namedType.name)
      ) {
        const lit = formatGraphQLDateTimeSampleValue();
        insertText = fIsList ? `${field.name}: [${lit}]` : `${field.name}: ${lit}`;
        isSnippet = false;
      } else if (typeStr.includes("Int") || typeStr.includes("Float")) {
        const pageDef = paginationDefaultForField(field.name, fIsList);
        if (pageDef !== null) {
          insertText = `${field.name}: ${pageDef}`;
          isSnippet = false;
        } else {
          insertText = fIsList ? `${field.name}: [\${1}]` : `${field.name}: \${1}`;
          isSnippet = true;
        }
      } else {
        insertText = fIsList ? `${field.name}: [\${1}]` : `${field.name}: \${1}`;
        isSnippet = true;
      }

      return {
        label: field.name,
        detail: typeStr,
        documentation: field.description || `Input field: ${field.name} (${typeStr})`,
        insertText,
        isSnippet,
        kind: "field" as const,
        sortText: `0_${field.name}`,
      };
    });
};

/**
 * Detect the operationType context at cursor position.
 * Returns "query", "mutation", or null.
 */
export const detectOperationContext = (textBeforeCursor: string): "query" | "mutation" | null => {
  // Find the last top-level operation keyword
  const queryMatch = textBeforeCursor.lastIndexOf("query ");
  const queryMatch2 = textBeforeCursor.lastIndexOf("query{");
  const mutationMatch = textBeforeCursor.lastIndexOf("mutation ");
  const mutationMatch2 = textBeforeCursor.lastIndexOf("mutation{");

  const lastQuery = Math.max(queryMatch, queryMatch2);
  const lastMutation = Math.max(mutationMatch, mutationMatch2);

  if (lastQuery === -1 && lastMutation === -1) return null;

  return lastMutation > lastQuery ? "mutation" : "query";
};

/**
 * Detect which operation field the cursor is inside (e.g. "getInventoryItems")
 * by tracing backward through the text before the cursor.
 */
export const detectCurrentFieldName = (textBeforeCursor: string): string | null => {
  // Look for the last operation-like pattern: fieldName( or fieldName {
  const match = textBeforeCursor.match(/(\w+)\s*(?:\([^)]*$|\{[^}]*$)/);

  if (!match) return null;

  // Walk back to find the most recent field name that opens a block
  const lines = textBeforeCursor.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const fieldMatch = line.match(/^(\w+)\s*[\({]/);
    if (fieldMatch) return fieldMatch[1];
  }

  return match[1] || null;
};

/**
 * Resolve the nested input block path from the current cursor context.
 * Example: `where: { amount: {` → ["where", "amount"]
 */
export const resolveInputBlockPath = (textBeforeCursor: string): string[] => {
  const blockPath: string[] = [];
  let depthForTrace = 0;

  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const char = textBeforeCursor[i];
    if (char === "}" || char === "]") {
      depthForTrace++;
      continue;
    }
    if (char !== "{" && char !== "[") {
      continue;
    }

    if (depthForTrace === 0) {
      const beforeBlock = textBeforeCursor.substring(0, i);
      const pathKey = resolveFieldNameBeforeOpeningBrace(beforeBlock);
      if (pathKey) {
        blockPath.unshift(pathKey);
      }
      continue;
    }

    depthForTrace--;
  }

  return blockPath;
};

/**
 * Resolve the exact input object type for the current nested input block path.
 * Returns null when the cursor is not inside a known input object block.
 */
export const resolveInputObjectTypeAtCursor = (options: {
  schema: GraphQLSchema;
  operationContext: "query" | "mutation";
  operationFieldName: string;
  blockPath: string[];
}): GraphQLInputObjectType | null => {
  const { schema, operationContext, operationFieldName, blockPath } = options;
  if (blockPath.length === 0) return null;

  const parentType =
    operationContext === "query" ? schema.getQueryType() : schema.getMutationType();
  if (!parentType) return null;

  const operationField = parentType.getFields()[operationFieldName];
  if (!operationField) return null;

  const topLevelArgName = blockPath[0];
  const topLevelArg = operationField.args.find((arg) => arg.name === topLevelArgName);
  if (!topLevelArg) return null;

  let currentType: GraphQLType | null = topLevelArg.type;

  for (let i = 1; i < blockPath.length; i++) {
    while (currentType && (isNonNullType(currentType) || isListType(currentType))) {
      currentType = currentType.ofType;
    }

    if (!currentType || !isInputObjectType(currentType)) return null;

    const pathSegment = blockPath[i];
    const nextField: { type: GraphQLType } | undefined = currentType.getFields()[pathSegment];
    if (!nextField) return null;
    currentType = nextField.type;
  }

  while (currentType && (isNonNullType(currentType) || isListType(currentType))) {
    currentType = currentType.ofType;
  }

  return currentType && isInputObjectType(currentType) ? currentType : null;
};

// ---------------------------------------------------------------------------
// Full-wrapper depth-0 snippets
// ---------------------------------------------------------------------------

/**
 * Build a complete `query { fieldName(args) { ...fields } }` snippet for a single
 * query operation. Used at editor depth 0 so the user doesn't need to type the
 * outer `query {}` wrapper themselves.
 */
const buildFullOperationSnippet = (
  field: import("graphql").GraphQLField<unknown, unknown>,
  operationType: "query" | "mutation",
): string => {
  const returnType = getNamedType(field.type);
  const argSnippet = buildArgumentSnippet(field.args, operationType, field.name);
  const fieldSelection = isObjectType(returnType)
    ? ` {\n${buildFieldSelectionSnippet(returnType, "    ")}\n  }`
    : "";

  const body = `  ${field.name}${argSnippet}${fieldSelection}`;
  return `${operationType} {\n${body}\n}`;
};

/**
 * Returns one completion suggestion per Query field, each inserting the full
 * `query { operation(...) { ...fields } }` block. Intended for use at editor
 * depth 0 so users can start from a blank editor.
 */
export const getFullQuerySnippets = (schema: GraphQLSchema): IntrospectionSuggestion[] => {
  const queryType = schema.getQueryType();
  if (!queryType) return [];

  return Object.values(queryType.getFields()).map((field) => ({
    label: field.name,
    detail: `Full Query → ${resolveTypeString(field.type)}`,
    documentation: field.description || `Full query: ${field.name}`,
    insertText: buildFullOperationSnippet(field, "query"),
    isSnippet: true,
    kind: "function" as const,
    sortText: `0_${field.name}`,
  }));
};

/**
 * Returns one completion suggestion per Mutation field, each inserting the full
 * `mutation { operation(...) { ...fields } }` block. Intended for use at editor
 * depth 0.
 */
export const getFullMutationSnippets = (schema: GraphQLSchema): IntrospectionSuggestion[] => {
  const mutationType = schema.getMutationType();
  if (!mutationType) return [];

  return Object.values(mutationType.getFields()).map((field) => ({
    label: field.name,
    detail: `Full Mutation → ${resolveTypeString(field.type)}`,
    documentation: field.description || `Full mutation: ${field.name}`,
    insertText: buildFullOperationSnippet(field, "mutation"),
    isSnippet: true,
    kind: "function" as const,
    sortText: `0_${field.name}`,
  }));
};
