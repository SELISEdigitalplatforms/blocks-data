import { HttpError } from "@/lib/http-client";
import type { IField, IndexDirection } from "../models/data-service";
import { buildValidationFieldName } from "./schema-normalization";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

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
  SCHEMA_NOT_FOUND: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.SCHEMA_NOT_FOUND"),
  SCHEMA_TYPE_NOT_INDEXABLE: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.INDEXES_ARE_ONLY_SUPPORTED_ON_ENTITY"),
  FIELD_NOT_INDEXABLE: (detail) =>
    detail ? tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.FIELD_DETAIL_CANNOT_BE_INDEXED", { detail }) : tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.ONE_OR_MORE_SELECTED_FIELDS_CANNOT"),
  INVALID_INDEX_FIELDS: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.SELECT_AT_LEAST_ONE_FIELD_WITH"),
  INVALID_INDEX_NAME: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.INDEX_NAME_CANNOT_EXCEED_128"),
  INDEX_ALREADY_EXISTS: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.AN_INDEX_WITH_THIS_NAME_OR"),
  INDEX_LIMIT_REACHED: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.THIS_SCHEMA_ALREADY_HAS_THE_MAXIMUM"),
  UNIQUE_INDEX_CONFLICT: () =>
    tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.CANNOT_CREATE_A_UNIQUE_INDEX_THIS"),
  INDEX_NOT_FOUND: () => tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.THIS_INDEX_NO_LONGER_EXISTS"),
  FIELD_USED_BY_INDEX: (detail) =>
    detail
      ? tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.THIS_FIELD_IS_USED_BY_INDEX", { detail })
      : tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.THIS_FIELD_IS_USED_BY_AN"),
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
  get ASC() { return tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.ASCENDING"); },
  get DESC() { return tStatic("data.gateway.schema", "SCHEMA_INDEX_UTILS.DESCENDING"); },
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
