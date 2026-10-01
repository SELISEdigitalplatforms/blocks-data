import type { IField } from "../models/data-service";

/** The attributes a review is worth mentioning, and how to say each one. */
const COMPARED_ATTRIBUTES: { key: keyof IField; label: string }[] = [
  { key: "type", label: "type" },
  { key: "requiredOn", label: "required" },
  { key: "isArray", label: "array" },
  { key: "isPIIData", label: "PII" },
  { key: "isUniqueData", label: "unique" },
  { key: "description", label: "description" },
];

export type FieldChange =
  | { kind: "added"; name: string }
  | { kind: "removed"; name: string }
  | { kind: "renamed"; from: string; to: string; attributes: string[] }
  | { kind: "modified"; name: string; attributes: string[] };

export type SchemaDiff = {
  changes: FieldChange[];
  /** Total changed fields — what the dirty bar counts. */
  count: number;
  /**
   * True when something will drop stored values: a removed field, or a rename,
   * which the API cannot tell apart from a delete plus an add.
   */
  losesData: boolean;
};

export type DiffRow = { id: string } & Partial<IField>;

const normalise = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const changedAttributes = (before: Partial<IField>, after: Partial<IField>): string[] =>
  COMPARED_ATTRIBUTES.filter(
    ({ key }) => normalise(before[key]) !== normalise(after[key]),
  ).map(({ label }) => label);

/**
 * What this edit will do to the schema.
 *
 * Fields have no id in the API — they are keyed by name — so a rename is
 * indistinguishable from a delete plus an add once it reaches the server, and
 * the stored column goes with it. Identity here comes from React Hook Form's
 * `field.id`, captured when edit mode opened: it survives the index shuffling
 * `useFieldArray` does on insert and remove, which names and indexes do not.
 */
export function diffSchemaFields({
  originalById,
  rows,
}: {
  /** RHF row id → the field as it was when edit mode opened. */
  originalById: Record<string, Partial<IField>>;
  /** Current form rows, each still carrying its RHF id. */
  rows: DiffRow[];
}): SchemaDiff {
  const changes: FieldChange[] = [];
  const seen = new Set<string>();

  rows.forEach((row) => {
    const before = originalById[row.id];
    const name = row.name ?? "";

    // No id on record means the row did not exist when editing began — a new
    // field, or a duplicate, which useFieldArray gives a fresh id.
    if (!before) {
      changes.push({ kind: "added", name });
      return;
    }

    seen.add(row.id);
    const attributes = changedAttributes(before, row);
    const from = before.name ?? "";

    if (from !== name) {
      changes.push({
        kind: "renamed",
        from,
        to: name,
        attributes: attributes.filter((a) => a !== "name"),
      });
      return;
    }

    if (attributes.length > 0) {
      changes.push({ kind: "modified", name, attributes });
    }
  });

  Object.entries(originalById).forEach(([id, field]) => {
    if (!seen.has(id)) changes.push({ kind: "removed", name: field.name ?? "" });
  });

  return {
    changes,
    count: changes.length,
    losesData: changes.some((c) => c.kind === "removed" || c.kind === "renamed"),
  };
}

/** One change as a phrase, for the dirty bar's summary line. */
export function describeChange(change: FieldChange): string {
  switch (change.kind) {
    case "added":
      return `${change.name || "New field"} added`;
    case "removed":
      return `${change.name} removed`;
    case "renamed":
      return `${change.from} renamed to ${change.to}`;
    case "modified":
      return `${change.name} ${change.attributes.join(", ")} changed`;
  }
}
