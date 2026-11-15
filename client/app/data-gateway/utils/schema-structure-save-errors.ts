import { HttpError } from "@/lib/http-client";
import { tStatic } from "@seliseblocks/genesis-os/i18n";
import { isNetworkFailure } from "@seliseblocks/genesis-os/observability";
import { mapIndexErrorFromException } from "./schema-index.utils";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/**
 * The save endpoint's FluentValidation messages (SaveFieldDefinitionRequestValidator and
 * FieldDefinitionRequestValidator), matched exactly, mapped to the key of their English line.
 * The server sends codes, not sentences, so showing them as they are would put
 * "Fields_Are_Required." in front of the user.
 */
const VALIDATION_MESSAGE_KEYS = new Map<string, string>([
  ["SchemaDefinitionItemId_Is_Required.", "SCHEMA_STRUCTURE_SAVE_ERRORS.THIS_SCHEMA_COULD_NOT_BE_IDENTIFIED"],
  ["Fields_Are_Required.", "SCHEMA_STRUCTURE_SAVE_ERRORS.ADD_AT_LEAST_ONE_PROPERTY"],
  ["Field_Names_Must_Be_Unique.", "SCHEMA_STRUCTURE_SAVE_ERRORS.PROPERTY_NAMES_MUST_BE_UNIQUE"],
  ["Field_Name_Is_Required.", "SCHEMA_STRUCTURE_SAVE_ERRORS.EVERY_PROPERTY_NEEDS_A_NAME"],
  ["Field_Name_Length_Must_Be_Between_1_And_50_Characters.", "SCHEMA_STRUCTURE_SAVE_ERRORS.PROPERTY_NAMES_CAN_BE_AT_MOST"],
  [
    "Field_Name_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.",
    "SCHEMA_STRUCTURE_SAVE_ERRORS.PROPERTY_NAMES_CAN_ONLY_CONTAIN",
  ],
  ["Field_Type_Is_Required.", "SCHEMA_STRUCTURE_SAVE_ERRORS.EVERY_PROPERTY_NEEDS_A_TYPE"],
  ["Field_Type_Is_Not_Valid.", "SCHEMA_STRUCTURE_SAVE_ERRORS.A_PROPERTY_USES_A_TYPE"],
  // The Enum values editor already says this in its own warning; one key keeps the two in step.
  ["Field_EnumValues_Is_Required.", "ENUM_VALUES_EDITOR.ADD_AT_LEAST_ONE_ALLOWED_VALUE"],
  ["Field_EnumValues_Not_Allowed_For_Non_Enum_Type.", "SCHEMA_STRUCTURE_SAVE_ERRORS.ONLY_ENUM_PROPERTIES_CAN_HAVE"],
  ["Field_EnumValues_Must_Not_Exceed_100_Values.", "SCHEMA_STRUCTURE_SAVE_ERRORS.AN_ENUM_PROPERTY_CAN_HAVE"],
  [
    "Field_EnumValues_Value_Length_Must_Be_Between_1_And_100_Characters.",
    "SCHEMA_STRUCTURE_SAVE_ERRORS.ALLOWED_VALUES_MUST_BE_1_100",
  ],
  [
    "Field_EnumValues_May_Only_Contain_Letters_Numbers_And_Underscore_And_Cannot_Start_With_A_Number.",
    "SCHEMA_STRUCTURE_SAVE_ERRORS.ALLOWED_VALUES_CAN_ONLY_CONTAIN",
  ],
  ["Field_EnumValues_Must_Be_Unique.", "SCHEMA_STRUCTURE_SAVE_ERRORS.ALLOWED_VALUES_MUST_BE_UNIQUE"],
]);

/** Shown for a validation entry this client has no line for, and for an empty list. */
const UNKNOWN_VALIDATION_KEY = "SCHEMA_STRUCTURE_SAVE_ERRORS.THE_SCHEMA_COULD_NOT_BE_SAVED_PROPERTIES";

/** A validation entry's text: the entry itself when it is a string, else its `errorMessage`. */
const entryText = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null) return undefined;
  const { errorMessage } = entry as { errorMessage?: unknown };
  return typeof errorMessage === "string" ? errorMessage : undefined;
};

/**
 * One English line per distinct message, in the order the server listed them. FluentValidation
 * runs every rule, so the same message can come back once per property; the toast says it once.
 * Only the message is read: property names, attempted values and the raw codes never reach the user.
 */
export function mapValidationFailures(entries: readonly unknown[]): string[] {
  const keys = entries.map((entry) => VALIDATION_MESSAGE_KEYS.get(entryText(entry)?.trim() ?? "") ?? UNKNOWN_VALIDATION_KEY);
  if (keys.length === 0) keys.push(UNKNOWN_VALIDATION_KEY);
  return [...new Set(keys)].map((key) => tStatic(DATA_GATEWAY_SCHEMA_MODULE, key));
}

/**
 * The request never got an answer (offline, DNS, CORS, TLS, aborted). genesis-os 4.5.0 puts the
 * thrown TypeError or DOMException in `HttpError.errors`; its next release reduces it to
 * `{ general, message }` strings, so both shapes are checked.
 */
export function isSaveNetworkFailure(errors: unknown): boolean {
  if (errors instanceof Error || errors instanceof DOMException) return isNetworkFailure(errors);
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) return false;
  const { general, message } = errors as { general?: unknown; message?: unknown };
  return [general, message].some((text) => typeof text === "string" && isNetworkFailure({ name: "TypeError", message: text }));
}

/**
 * What the error toast shows for a rejected structure save that is not a 404 (the editor handles
 * that one itself, since it also leaves edit mode). In order: the index message, the mapped
 * validation lines, the connection message, then the error's own body and, for anything that is
 * not an HttpError, nothing, which the toast shows as "An unexpected error occurred."
 */
export function mapSchemaSaveError(error: unknown): unknown {
  if (!(error instanceof HttpError)) return undefined;
  const indexMessage = mapIndexErrorFromException(error);
  if (indexMessage) return indexMessage;
  if (Array.isArray(error.errors)) return mapValidationFailures(error.errors);
  if (isSaveNetworkFailure(error.errors)) {
    return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_STRUCTURE_SAVE_ERRORS.THE_SCHEMA_COULD_NOT_BE_SAVED_CONNECTION");
  }
  return error.errors;
}
