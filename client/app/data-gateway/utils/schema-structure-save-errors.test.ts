import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http-client";
import { isSaveNetworkFailure, mapSchemaSaveError, mapValidationFailures } from "./schema-structure-save-errors";

const GENERIC = "The schema could not be saved. Check the properties and try again.";
const CONNECTION = "The schema could not be saved. Check your connection and try again.";

/** The body FluentValidation sends for one failed rule, as the save endpoint serializes it. */
const failure = (errorMessage: string, propertyName = "Fields") => ({
  propertyName,
  errorMessage,
  attemptedValue: [],
  severity: 0,
  errorCode: "PredicateValidator",
});

const validation400 = (errors: unknown[]) => new HttpError(400, { errors: errors as never });

describe("mapValidationFailures", () => {
  // H3–H6: every key the save can return has its own line.
  it.each([
    ["SchemaDefinitionItemId_Is_Required.", "This schema could not be identified. Reload the page and try again."],
    ["Fields_Are_Required.", "Add at least one property before saving."],
    ["Field_Names_Must_Be_Unique.", "Property names must be unique."],
    ["Field_Name_Is_Required.", "Every property needs a name."],
    ["Field_Name_Length_Must_Be_Between_1_And_50_Characters.", "Property names can be at most 50 characters."],
    [
      "Field_Name_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.",
      "Property names can only contain letters, numbers and underscores, and cannot start with a number.",
    ],
    ["Field_Type_Is_Required.", "Every property needs a type."],
    ["Field_Type_Is_Not_Valid.", "A property uses a type that does not exist. Choose another type."],
    ["Field_EnumValues_Is_Required.", "Add at least one allowed value for Enum."],
    ["Field_EnumValues_Not_Allowed_For_Non_Enum_Type.", "Only Enum properties can have allowed values."],
    ["Field_EnumValues_Must_Not_Exceed_100_Values.", "An Enum property can have at most 100 allowed values."],
    ["Field_EnumValues_Value_Length_Must_Be_Between_1_And_100_Characters.", "Allowed values must be 1–100 characters."],
    [
      "Field_EnumValues_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.",
      "Allowed values can only contain letters, numbers and underscores, and cannot start with a number.",
    ],
    ["Field_EnumValues_Must_Be_Unique.", "Allowed values must be unique."],
  ])("maps %s to its line", (key, line) => {
    expect(mapValidationFailures([failure(key, "Fields[0].Name")])).toEqual([line]);
  });

  it("shows each distinct message once, in the order it first appears (H7, E3)", () => {
    expect(
      mapValidationFailures([
        failure("Field_EnumValues_Must_Be_Unique.", "Fields[1].EnumValues"),
        failure("Field_Type_Is_Not_Valid.", "Fields[2].Type"),
        failure("Field_EnumValues_Must_Be_Unique.", "Fields[4].EnumValues"),
      ]),
    ).toEqual(["Allowed values must be unique.", "A property uses a type that does not exist. Choose another type."]);
  });

  it("gives one generic line for unknown, textless and non-object entries, next to the mapped ones (C3, E4)", () => {
    expect(
      mapValidationFailures([{ errorMessage: "Some_Future_Rule." }, failure("Fields_Are_Required."), { propertyName: "X" }, 42, null]),
    ).toEqual([GENERIC, "Add at least one property before saving."]);
  });

  it("gives only the generic line for an empty list (C4, E5)", () => {
    expect(mapValidationFailures([])).toEqual([GENERIC]);
  });

  it("reads plain string entries and ignores surrounding spaces", () => {
    expect(mapValidationFailures([" Field_Names_Must_Be_Unique. ", { errorMessage: "Field_Type_Is_Required.\n" }])).toEqual([
      "Property names must be unique.",
      "Every property needs a type.",
    ]);
  });

  it("never shows the raw key, the property name or the attempted value (C8)", () => {
    const lines = mapValidationFailures([
      { ...failure("Field_Name_Length_Must_Be_Between_1_And_50_Characters.", "Fields[1].Name"), attemptedValue: "a".repeat(51) },
    ]);
    const text = lines.join(" ");
    expect(text).not.toContain("Field_Name_Length");
    expect(text).not.toContain("Fields[1]");
    expect(text).not.toContain("aaaa");
    expect(text).not.toContain("An unexpected error occurred");
  });

  it("does not match a key by prefix or inherited name", () => {
    expect(mapValidationFailures(["Fields_Are_Required", "constructor", "toString"])).toEqual([GENERIC]);
  });
});

describe("isSaveNetworkFailure", () => {
  it.each([
    ["a fetch TypeError (genesis-os 4.5.0)", new TypeError("Failed to fetch")],
    ["another browser's network TypeError", new TypeError("NetworkError when attempting to fetch resource.")],
    ["an aborted request", new DOMException("The user aborted a request.", "AbortError")],
    ["the next genesis-os shape", { general: "Failed to fetch", message: "Failed to fetch" }],
    ["the next shape with only a message", { message: "Load failed" }],
  ])("is true for %s", (_label, errors) => {
    expect(isSaveNetworkFailure(errors)).toBe(true);
  });

  it.each([
    ["a server's generic body", { general: "Something went wrong" }],
    ["a non-network TypeError", new TypeError("x is not a function")],
    ["a dictionary of field errors", { Fields: ["Field names must be unique"] }],
    ["a validation list", [{ errorMessage: "Failed to fetch" }]],
    ["a bare string", "Failed to fetch"],
    ["null", null],
    ["undefined", undefined],
    ["a non-string general", { general: 500 }],
  ])("is false for %s", (_label, errors) => {
    expect(isSaveNetworkFailure(errors)).toBe(false);
  });
});

describe("mapSchemaSaveError", () => {
  it("maps a validation 400 to its lines (row 3)", () => {
    expect(mapSchemaSaveError(validation400([failure("Field_Names_Must_Be_Unique.")]))).toEqual(["Property names must be unique."]);
  });

  it("keeps the index message ahead of everything else (row 2, E10)", () => {
    const error = new HttpError(400, {
      errors: { isSuccess: false, message: "FIELD_USED_BY_INDEX: idx_email", httpStatusCode: 400, data: null, errors: null } as never,
    });
    expect(mapSchemaSaveError(error)).toBe("This field is used by index 'idx_email' and cannot be deleted.");
  });

  it("names a connection problem in both genesis-os shapes (row 4, E8, E9)", () => {
    expect(mapSchemaSaveError(new HttpError(500, { errors: new TypeError("Failed to fetch") as never }))).toBe(CONNECTION);
    expect(mapSchemaSaveError(new HttpError(500, { errors: { general: "Failed to fetch", message: "Failed to fetch" } }))).toBe(
      CONNECTION,
    );
  });

  it("passes any other body through as today (row 5, C5, E12, E13)", () => {
    const dictionary = { "$.fields[0].isArray": ["The JSON value could not be converted."] };
    expect(mapSchemaSaveError(new HttpError(400, { errors: dictionary }))).toBe(dictionary);
    const serverFault = { general: "Something went wrong" };
    expect(mapSchemaSaveError(new HttpError(500, { errors: serverFault }))).toBe(serverFault);
    const sessionExpired = { general: "Session expired" };
    expect(mapSchemaSaveError(new HttpError(401, { errors: sessionExpired }))).toBe(sessionExpired);
  });

  it("gives nothing for a value that is not an HttpError, so the toast falls back as today (row 6, C7)", () => {
    expect(mapSchemaSaveError(new TypeError("Failed to fetch"))).toBeUndefined();
    expect(mapSchemaSaveError("boom")).toBeUndefined();
    expect(mapSchemaSaveError(undefined)).toBeUndefined();
  });
});
