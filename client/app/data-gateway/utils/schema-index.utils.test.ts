import { describe, expect, it } from "vitest";
import { mapIndexRelatedErrorMessage } from "./schema-index.utils";

describe("mapIndexRelatedErrorMessage", () => {
  it("maps a bare error code from message", () => {
    expect(mapIndexRelatedErrorMessage({ message: "SCHEMA_NOT_FOUND" })).toBe(
      "Schema not found.",
    );
    expect(
      mapIndexRelatedErrorMessage({ message: "SCHEMA_TYPE_NOT_INDEXABLE" }),
    ).toBe("Indexes are only supported on Entity schemas.");
    expect(mapIndexRelatedErrorMessage({ message: "INDEX_LIMIT_REACHED" })).toBe(
      "This schema already has the maximum of 15 indexes.",
    );
    expect(mapIndexRelatedErrorMessage({ message: "INDEX_ALREADY_EXISTS" })).toBe(
      "An index with this exact field combination already exists.",
    );
    expect(mapIndexRelatedErrorMessage({ message: "UNIQUE_INDEX_CONFLICT" })).toBe(
      "Cannot create a unique index: this field combination already has duplicate values in existing data.",
    );
    expect(mapIndexRelatedErrorMessage({ message: "INDEX_NOT_FOUND" })).toBe(
      "This index no longer exists.",
    );
  });

  it("maps a code with a ': detail' suffix, using the detail in the message", () => {
    expect(
      mapIndexRelatedErrorMessage({ message: "FIELD_NOT_INDEXABLE: age" }),
    ).toBe("Field 'age' cannot be indexed.");
    expect(
      mapIndexRelatedErrorMessage({ message: "FIELD_USED_BY_INDEX: email_1" }),
    ).toBe("This field is used by index 'email_1' and cannot be deleted.");
  });

  it("falls back to a generic message when the code has no detail", () => {
    expect(mapIndexRelatedErrorMessage({ message: "FIELD_NOT_INDEXABLE" })).toBe(
      "One or more selected fields cannot be indexed.",
    );
    expect(mapIndexRelatedErrorMessage({ message: "FIELD_USED_BY_INDEX" })).toBe(
      "This field is used by an existing index and cannot be deleted.",
    );
  });

  it("falls back to the first FluentValidation error's errorMessage when message is absent", () => {
    expect(
      mapIndexRelatedErrorMessage({
        errors: [{ errorMessage: "INVALID_INDEX_FIELDS" }],
      }),
    ).toBe("Select at least one field, with no field repeated.");
  });

  it("returns null for an unrecognized code, so callers can fall back to generic handling", () => {
    expect(mapIndexRelatedErrorMessage({ message: "Schema not found" })).toBeNull();
    expect(mapIndexRelatedErrorMessage({})).toBeNull();
    expect(mapIndexRelatedErrorMessage({ errors: ["plain string error"] })).toBeNull();
  });
});
