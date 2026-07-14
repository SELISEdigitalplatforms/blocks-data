export const allowOnlyLettersKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const allowedControlKeys = ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete"];
  if (!/^[a-zA-Z]$/.test(e.key) && !allowedControlKeys.includes(e.key)) {
    e.preventDefault();
  }
};

export const allowLettersNumbersUnderscoreKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  const allowedControlKeys = ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete"];
  if (!/^[a-zA-Z0-9_]$/.test(e.key) && !allowedControlKeys.includes(e.key)) {
    e.preventDefault();
  }
};

// Allowed characters for schema/entity/field names: letters, digits, and '_' only.
// Must start with a letter or underscore (cannot start with a digit).
export const SCHEMA_NAME_ALLOWED_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const typeOptions = ["String", "Int", "Float", "Boolean", "DateTime"];

export const readonlyPropertyNames = [
  "ItemId",
  "CreatedDate",
  "CreatedBy",
  "LastUpdatedDate",
  "LastUpdatedBy",
  "Language",
  "OrganizationId",
  "Tags",
];
