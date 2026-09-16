import { HttpError } from "@/lib/http-client";
import type { IField, IndexDirection } from "../models/data-service";
import { buildValidationFieldName } from "./schema-normalization";

/**
 * The backend returns a bare error code (optionally with a ": <detail>" suffix) either as
 * ServiceResponse.message (business-rule errors) or as the first FluentValidation failure's
 * errorMessage (request-shape errors). Both are normalized here to one lookup.
 */
interface IndexErrorSource {
  message?: string | null;
  errors?: unknown;
}

const INDEX_ERROR_MESSAGES: Record<string, (detail: string) => string> = {
  SCHEMA_NOT_FOUND: () => "Schema not found.",
  SCHEMA_TYPE_NOT_INDEXABLE: () => "Indexes are only supported on Entity schemas.",
  FIELD_NOT_INDEXABLE: (detail) =>
    detail ? `Field '${detail}' cannot be indexed.` : "One or more selected fields cannot be indexed.",
  INVALID_INDEX_FIELDS: () => "Select at least one field, with no field repeated.",
  INVALID_INDEX_NAME: () => "Index name cannot exceed 128 characters.",
  INDEX_ALREADY_EXISTS: () => "An index with this name or exact property combination already exists.",
  INDEX_LIMIT_REACHED: () => "This schema already has the maximum of 15 indexes.",
  UNIQUE_INDEX_CONFLICT: () =>
    "Cannot create a unique index: this field combination already has duplicate values in existing data.",
  INDEX_NOT_FOUND: () => "This index no longer exists.",
  FIELD_USED_BY_INDEX: (detail) =>
    detail
      ? `This field is used by index '${detail}' and cannot be deleted.`
      : "This field is used by an existing index and cannot be deleted.",
};

const extractRawCode = (res: IndexErrorSource): string | null => {
  if (typeof res.message === "string" && res.message.trim()) return res.message;
  if (Array.isArray(res.errors) && res.errors.length > 0) {
    const first = res.errors[0] as { errorMessage?: unknown } | string;
    if (typeof first === "string") return first;
    if (typeof first?.errorMessage === "string") return first.errorMessage;
  }
  return null;
};

/**
 * Maps a Phase 1 backend error code (e.g. "FIELD_NOT_INDEXABLE: age, tags") to a human-readable
 * message. Returns null when the response doesn't carry a recognized index-related code, so the
 * caller can fall back to its own generic error handling.
 */
export function mapIndexRelatedErrorMessage(res: IndexErrorSource): string | null {
  const raw = extractRawCode(res);
  if (!raw) return null;

  const separatorIndex = raw.indexOf(":");
  const code = (separatorIndex === -1 ? raw : raw.slice(0, separatorIndex)).trim();
  const detail = separatorIndex === -1 ? "" : raw.slice(separatorIndex + 1).trim();

  const toMessage = INDEX_ERROR_MESSAGES[code];
  return toMessage ? toMessage(detail) : null;
}

/**
 * The HTTP client throws on any non-2xx response (see HttpError), so a business-rule failure
 * like a duplicate-key conflict on a unique index never reaches the resolved-response branch --
 * it lands in a catch block instead. `HttpError.errors` holds the parsed backend response body
 * in that case (the same `{ message, errors }` shape `mapIndexRelatedErrorMessage` expects), so
 * this unwraps it before delegating. Returns null for non-HTTP errors or unrecognized codes, so
 * the caller can fall back to its own generic error handling.
 */
export function mapIndexErrorFromException(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  return mapIndexRelatedErrorMessage((error.errors ?? {}) as IndexErrorSource);
}

export const INDEX_DIRECTION_LABELS: Record<IndexDirection, string> = {
  ASC: "Ascending",
  DESC: "Descending",
};

export const MAX_INDEX_FIELDS = 10;
export const MAX_INDEXES_PER_SCHEMA = 15;

/**
 * Flattens a schema's field tree into dot-path field names (e.g. "assignee.email" for a field
 * nested under a reference/child-schema field). Only leaf fields are returned: a field with
 * nested `fields` is itself a reference/object field, which is never indexable server-side (see
 * SchemaIndexService.IsFieldIndexable) — only its scalar descendants are.
 */
export function flattenIndexableFieldNames(
  fields: IField[],
  ancestorPath: string[] = [],
): string[] {
  return fields.flatMap((field) =>
    field.fields?.length
      ? flattenIndexableFieldNames(field.fields, [...ancestorPath, field.name])
      : [buildValidationFieldName(ancestorPath, field.name)],
  );
}
