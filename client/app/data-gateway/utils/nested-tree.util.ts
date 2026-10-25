import type { IField, ISchemaDetails } from "../models/data-service";
import { mergeFieldsWithParentData } from "./schema-normalization";

/**
 * The nested-property tree of the schema table: which object properties are open, and the rows
 * under each open one, flattened depth-first so they render as ordinary table rows with guide lines.
 */

/** One guide cell: blank, a line passing a deeper row (│), a branch (├), or the last branch (└). */
export type TreeGuide = "none" | "through" | "tee" | "end";

export interface NestedTreeRow {
  /** "field" for a property; "loading" while the parent's children load; "empty" when it has none. */
  kind: "field" | "loading" | "empty";
  /** The dotted path from the table's own row, e.g. "Address.Geo.Lat". Unique within the table. */
  path: string;
  /** 1 for a direct child of a table row, 2 for a grandchild, and so on. */
  depth: number;
  field: IField;
  /** One per depth level; the last is this row's own branch. */
  guides: TreeGuide[];
  /** The schema this property's type names, when it is an object; null otherwise. */
  childSchema: ISchemaDetails | null;
  /** Why this object can't be opened (it contains itself); null when it can. */
  blockedReason: string | null;
  isExpanded: boolean;
}

/**
 * Which paths are open. `all` turns it around for Expand all: `paths` then lists the ones closed
 * since, so objects that load later open too.
 */
export interface TreeExpansion {
  all: boolean;
  paths: ReadonlySet<string>;
}

export const NOTHING_EXPANDED: TreeExpansion = { all: false, paths: new Set() };
export const EVERYTHING_EXPANDED: TreeExpansion = { all: true, paths: new Set() };

export const isPathExpanded = (expansion: TreeExpansion, path: string) =>
  expansion.all ? !expansion.paths.has(path) : expansion.paths.has(path);

export function togglePath(expansion: TreeExpansion, path: string): TreeExpansion {
  const paths = new Set(expansion.paths);
  if (paths.has(path)) paths.delete(path);
  else paths.add(path);
  return { all: expansion.all, paths };
}

/**
 * A type that already appears above it in its own branch (Employee → Manager: Employee) would open
 * forever; it is shown, but not opened again.
 */
export function selfReferenceReason(childSchema: ISchemaDetails, lineage: readonly string[]): string | null {
  const name = childSchema.schemaName.trim().toLowerCase();
  return lineage.some((ancestor) => ancestor.trim().toLowerCase() === name)
    ? `${childSchema.schemaName} contains itself, so it isn't opened again here`
    : null;
}

/** `lastAt[k]` says whether the ancestor at depth k + 1 was the last of its siblings. */
function guidesFor(depth: number, isLast: boolean, lastAt: readonly boolean[]): TreeGuide[] {
  const guides: TreeGuide[] = [];
  for (let level = 1; level < depth; level++) guides.push(lastAt[level - 1] ? "none" : "through");
  guides.push(isLast ? "end" : "tee");
  return guides;
}

export interface TreeContext {
  isExpanded: (path: string) => boolean;
  /** The schema a property's type names, if it is an object type. */
  findChild: (type: string | undefined) => ISchemaDetails | undefined;
  /** The child schema's own properties, or null while they load. */
  fieldsOf: (schema: ISchemaDetails) => IField[] | null;
}

const PLACEHOLDER_FIELD: IField = { name: "", type: "", isArray: false };

/**
 * The rows under one open property, depth-first, with each open descendant's rows right after it.
 * `lineage` is the schema names above `parent` (the table's own schema first), for the self-reference
 * check. The property's own nested data (validation, access, defaults) is merged over the child
 * schema's fields, exactly as the embedded child table did.
 */
export function nestedRows(
  parent: { path: string; field: IField | undefined; childSchema: ISchemaDetails },
  lineage: readonly string[],
  context: TreeContext,
  depth = 1,
  lastAt: readonly boolean[] = [],
): NestedTreeRow[] {
  const own = context.fieldsOf(parent.childSchema);
  const placeholder = (kind: "loading" | "empty"): NestedTreeRow[] => [
    {
      kind,
      path: `${parent.path}.(${kind})`,
      depth,
      field: PLACEHOLDER_FIELD,
      guides: guidesFor(depth, true, lastAt),
      childSchema: null,
      blockedReason: null,
      isExpanded: false,
    },
  ];
  if (own === null) return placeholder("loading");

  const fields = mergeFieldsWithParentData(own, parent.field?.fields);
  if (fields.length === 0) return placeholder("empty");

  const below = [...lineage, parent.childSchema.schemaName];
  return fields.flatMap((field, index) => {
    const isLast = index === fields.length - 1;
    const path = `${parent.path}.${field.name}`;
    const childSchema = context.findChild(field.type) ?? null;
    const blockedReason = childSchema ? selfReferenceReason(childSchema, below) : null;
    const isExpanded = Boolean(childSchema) && !blockedReason && context.isExpanded(path);
    const row: NestedTreeRow = {
      kind: "field",
      path,
      depth,
      field,
      guides: guidesFor(depth, isLast, lastAt),
      childSchema,
      blockedReason,
      isExpanded,
    };
    return isExpanded && childSchema
      ? [row, ...nestedRows({ path, field, childSchema }, below, context, depth + 1, [...lastAt, isLast])]
      : [row];
  });
}
