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

export const typeOptions = ["String", "Int", "Float", "Boolean", "DateTime"];

export const readonlyPropertyNames = [
  "ItemId",
  "CreatedDate",
  "CreatedBy",
  "LastUpdatedDate",
  "LastUpdatedBy",
  "Language",
  "OrganizationIds",
  "Tags",
];
