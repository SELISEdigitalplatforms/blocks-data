// ---------------------------------------------------------------------------
// Shared constants & helpers for GraphQL query/snippet generation.
// Used by both `introspection-utils.ts` (autocompletion snippets)
// and `schemas-drawer.tsx` (schema-drawer "Use in Editor" queries).
// ---------------------------------------------------------------------------

/** Field name collapsed to `{}` in generated queries (user fills in as needed). */
export const COLLAPSIBLE_FILTER_FIELD = "where";

/** Field names whose list types are collapsed to `[]` in generated queries. */
export const COLLAPSIBLE_LIST_FIELDS = new Set(["order"]);

/** Logical operator fields (OR/AND) that should be collapsed to `[{}]` in filter inputs. */
export const LOGICAL_OPERATOR_FIELDS = new Set(["or", "and"]);

/** Field names whose list types should default to `[""]` (e.g. filter operators). */
export const LIST_EMPTY_STRING_FIELDS = new Set(["in", "nin"]);

/** Inline comments appended to well-known argument names. */
export const KNOWN_ARG_COMMENTS: Record<string, string> = {
  filter: "# stringify mongo filter",
  sort: "# stringify mongo sorting",
};

/** Stringified mongo literal used for filter / sort defaults. */
export const MONGO_FILTER_SORT_LITERAL = `"{}"`;

/** String defaults for well-known fields (schemas-drawer path). */
export const KNOWN_STRING_DEFAULTS: Record<string, string> = {
  filter: '"{}" # stringify mongo filter',
  sort: '"{}" # stringify mongo sorting',
};

/** Integer defaults for pagination fields. */
export const KNOWN_INT_DEFAULTS: Record<string, string> = {
  pageNo: "1",
  pageSize: "10",
};

/**
 * Top-level query arg names excluded from **query** operation snippets only
 * (`buildArgumentSnippet` when `operationType === "query"`).
 * `input` duplicates filter/sort already covered by `where`/`order`
 * and pagination already covered by `paging`.
 * Do not apply this set to mutations — insert/update/delete need `input` in snippets.
 */
export const EXCLUDED_QUERY_ARG_NAMES = new Set(["input"]);

/**
 * Top-level arg names excluded from update / updateMany / delete / deleteMany mutations.
 * `filter` (stringify mongo filter) is redundant when `where` is present.
 */
export const EXCLUDED_MUTATION_FILTER_ARG_NAMES = new Set(["filter"]);

/**
 * Sub-fields of input object types hidden from playground auto-suggestions inside `input: { }`.
 * `DynamicQueryInput` includes `pageNo` / `pageSize`; keep those visible (top-level `paging` may still exist on the field).
 */
export const EXCLUDED_INPUT_SUBFIELDS = new Set<string>();

/** System-managed fields excluded from mutation insert/update inputs. */
export const SYSTEM_INPUT_FIELDS = new Set([
  "ItemId",
  "Language",
  "OrganizationId",
  "Tags",
  "CreatedDate",
  "CreatedBy",
  "LastUpdatedDate",
  "LastUpdatedBy",
  "IsDeleted",
  "DeletedDate",
]);

/**
 * Custom scalar names treated like strings for mutation `input` sample snippets
 * (e.g. DateIssued / DueDate so autocomplete is not left with a bare `field:`).
 */
export const MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES = new Set([
  "DateTime",
  "Date",
  "DateTimeOffset",
]);

// ---------------------------------------------------------------------------
// Shared helper functions
// ---------------------------------------------------------------------------

/** Returns the mongo string literal for filter/sort fields, or null. */
export function mongoStringLiteralForField(fieldName: string, isList: boolean): string | null {
  if (isList) {
    if (LIST_EMPTY_STRING_FIELDS.has(fieldName)) return '[""]';
    return null;
  }
  if (fieldName === "filter" || fieldName === "sort") return MONGO_FILTER_SORT_LITERAL;
  return null;
}

/** Returns 1/10 for pageNo/pageSize, or null. */
export function paginationDefaultForField(fieldName: string, isList: boolean): string | null {
  if (isList) return null;
  if (fieldName === "pageNo") return "1";
  if (fieldName === "pageSize") return "10";
  return null;
}

/**
 * GraphQL string literal for a UTC instant in ISO-8601 form without fractional seconds
 * (e.g. `"2026-04-29T12:34:56Z"`). Used for DateTime / Date / DateTimeOffset sample values
 * in mutation templates and autocomplete.
 */
export function formatGraphQLDateTimeSampleValue(date: Date = new Date()): string {
  const iso = date.toISOString();
  const normalized = /\.\d{3}Z$/.test(iso) ? iso.replace(/\.\d{3}Z$/, "Z") : iso;
  return `"${normalized}"`;
}

/** String default for schemas-drawer query generation. */
export function getStringDefault(fieldName?: string, isMutationInput?: boolean): string {
  if (fieldName && fieldName in KNOWN_STRING_DEFAULTS) return KNOWN_STRING_DEFAULTS[fieldName];
  return isMutationInput ? '"Sample text"' : '""';
}

/** Int default for schemas-drawer query generation. */
export function getIntDefault(fieldName?: string, isMutationInput?: boolean): string {
  if (fieldName && fieldName in KNOWN_INT_DEFAULTS) return KNOWN_INT_DEFAULTS[fieldName];
  return isMutationInput ? "1" : "0";
}

/** Float default for schemas-drawer query generation. */
export function getFloatDefault(fieldName?: string, isMutationInput?: boolean): string {
  if (fieldName && fieldName in KNOWN_INT_DEFAULTS) return KNOWN_INT_DEFAULTS[fieldName];
  return isMutationInput ? "1.0" : "0";
}
