import type { IndexDirection } from "../models/data-service";

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
  INDEX_ALREADY_EXISTS: () => "An index with this exact field combination already exists.",
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

export const INDEX_DIRECTION_LABELS: Record<IndexDirection, string> = {
  ASC: "Ascending",
  DESC: "Descending",
};

export const MAX_INDEX_FIELDS = 10;
export const MAX_INDEXES_PER_SCHEMA = 15;
