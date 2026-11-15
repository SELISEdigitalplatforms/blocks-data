/**
 * Builds the Data tab's `get<Schema>s` selection from the published gateway type.
 *
 * The form can hold fields the live gateway type doesn't have yet (saved but not
 * published, or not saved at all). Selecting those makes the gateway reject the
 * whole query, so this helper keeps only the fields that exist on the item OBJECT
 * type of `Query.get<Schema>s → items` and reports the rest as missing.
 *
 * It wraps the shared introspection helpers instead of changing them: the preview
 * drawer and the playground rely on their current behaviour.
 */
import {
  buildSelectionSet,
  resolveBaseTypeName,
  type IntrospectionType,
  type TypeRef,
} from "./generate-preview-queries";

export interface DataTabField {
  name: string;
  type?: string | null;
  isArray: boolean;
  isPIIData?: boolean;
  isUniqueData?: boolean;
}

export type DataTabSelection =
  | { status: "unresolved" }
  | { status: "not-on-gateway"; queryTypeName: string }
  | {
      status: "resolved";
      queryTypeName: string;
      itemTypeName: string;
      selectable: DataTabField[];
      missingFields: string[];
      /** Nested selection lines by field name, for OBJECT-typed fields only. */
      nestedSelection: Record<string, string[]>;
    };

export interface ResolveDataTabSelectionInput {
  rawIntrospection: unknown;
  schemaName: string;
  fields: DataTabField[];
}

/** Indent of the top-level lines inside `items { … }` in the Data tab query. */
export const DATA_TAB_SELECTION_INDENT = "      ";

const UNRESOLVED: DataTabSelection = { status: "unresolved" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSchema(rawIntrospection: unknown) {
  if (!isRecord(rawIntrospection) || !isRecord(rawIntrospection.data)) return null;
  const schema = rawIntrospection.data.__schema;
  if (!isRecord(schema) || !Array.isArray(schema.types)) return null;
  const queryType = schema.queryType;
  if (!isRecord(queryType) || typeof queryType.name !== "string") return null;
  return { types: schema.types as unknown[], queryTypeName: queryType.name };
}

function buildTypeMap(types: unknown[]): Map<string, IntrospectionType> {
  const typeMap = new Map<string, IntrospectionType>();
  for (const type of types) {
    if (isRecord(type) && typeof type.name === "string") {
      typeMap.set(type.name, type as unknown as IntrospectionType);
    }
  }
  return typeMap;
}

function objectFields(type: IntrospectionType | undefined) {
  if (type?.kind !== "OBJECT" || !Array.isArray(type.fields)) return null;
  return type.fields.filter((field) => isRecord(field) && typeof field.name === "string");
}

type ItemFields = NonNullable<ReturnType<typeof objectFields>>;

function baseTypeOf(typeRef: unknown): string | null {
  return isRecord(typeRef) ? resolveBaseTypeName(typeRef as unknown as TypeRef) : null;
}

/**
 * The fallback when no form field is on the item type: GraphQL rejects an empty
 * selection set, so pick `ItemId`, else the first non-object field, else `__typename`.
 */
function fallbackField(
  itemFields: ItemFields,
  typeMap: Map<string, IntrospectionType>,
): DataTabField {
  if (itemFields.some((field) => field.name === "ItemId")) {
    return { name: "ItemId", isArray: false };
  }
  const scalar = itemFields.find((field) => {
    const base = baseTypeOf(field.type);
    return !base || typeMap.get(base)?.kind !== "OBJECT";
  });
  return { name: scalar?.name ?? "__typename", isArray: false };
}

/** The item OBJECT type of `get<Schema>s → items`, or null when its shape is unexpected. */
function findItemType(
  listField: ItemFields[number],
  typeMap: Map<string, IntrospectionType>,
): { itemTypeName: string; itemFields: ItemFields } | null {
  const resultTypeName = baseTypeOf(listField.type);
  const resultFields = objectFields(resultTypeName ? typeMap.get(resultTypeName) : undefined);
  const itemsField = resultFields?.find((field) => field.name === "items");
  const itemTypeName = itemsField ? baseTypeOf(itemsField.type) : null;
  const itemFields = objectFields(itemTypeName ? typeMap.get(itemTypeName) : undefined);
  return itemTypeName && itemFields ? { itemTypeName, itemFields } : null;
}

/** Splits the form fields into the ones the item type has and the missing ones, in form order. */
function splitFormFields(
  fields: DataTabField[],
  itemTypeName: string,
  itemFields: ItemFields,
  typeMap: Map<string, IntrospectionType>,
) {
  const itemFieldsByName = new Map(itemFields.map((field) => [field.name, field]));
  const selectable: DataTabField[] = [];
  const missingFields: string[] = [];
  const nestedSelection: Record<string, string[]> = {};
  const seenNames = new Set<string>();

  for (const field of Array.isArray(fields) ? fields : []) {
    const name = typeof field?.name === "string" ? field.name.trim() : "";
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);

    const itemField = itemFieldsByName.get(name);
    if (!itemField) {
      missingFields.push(name);
      continue;
    }

    selectable.push({ ...field, name });
    const base = baseTypeOf(itemField.type);
    if (base && typeMap.get(base)?.kind === "OBJECT") {
      nestedSelection[name] = buildSelectionSet(
        base,
        typeMap,
        1,
        `${DATA_TAB_SELECTION_INDENT}  `,
        new Set([itemTypeName]),
      );
    }
  }
  return { selectable, missingFields, nestedSelection };
}

/**
 * Resolves which form fields the live gateway can serve. An unexpected shape of
 * the schema, query, result or item type gives `unresolved`, and the caller then
 * builds the query as it did before this helper existed. Nested types are read
 * by the shared `buildSelectionSet`, so the tab still guards the call.
 */
export function resolveDataTabSelection({
  rawIntrospection,
  schemaName,
  fields,
}: ResolveDataTabSelectionInput): DataTabSelection {
  const schema = readSchema(rawIntrospection);
  if (!schema || !schemaName) return UNRESOLVED;

  const typeMap = buildTypeMap(schema.types);
  const { queryTypeName } = schema;
  const queryFields = objectFields(typeMap.get(queryTypeName));
  if (!queryFields) return UNRESOLVED;
  const listField = queryFields.find((field) => field.name === `get${schemaName}s`);
  if (!listField) return { status: "not-on-gateway", queryTypeName };

  const itemType = findItemType(listField, typeMap);
  if (!itemType) return UNRESOLVED;
  const { itemTypeName, itemFields } = itemType;

  const { selectable, missingFields, nestedSelection } = splitFormFields(
    fields,
    itemTypeName,
    itemFields,
    typeMap,
  );
  if (selectable.length === 0) selectable.push(fallbackField(itemFields, typeMap));

  return {
    status: "resolved",
    queryTypeName,
    itemTypeName,
    selectable,
    missingFields,
    nestedSelection,
  };
}

/**
 * The `items { … }` lines for a resolved selection. A projection narrows the
 * selectable fields by name; when nothing selectable is left, every selectable
 * field is used, as the tab already does for a projection that matches nothing.
 */
export function buildResolvedSelectionLines(
  selection: Extract<DataTabSelection, { status: "resolved" }>,
  projectionFields?: string[],
): string[] {
  let fields = selection.selectable;
  if (projectionFields && projectionFields.length > 0) {
    const projected = fields.filter((field) => projectionFields.includes(field.name));
    if (projected.length > 0) fields = projected;
  }

  return fields.flatMap((field) => {
    const nested = selection.nestedSelection[field.name];
    if (!nested) return [`${DATA_TAB_SELECTION_INDENT}${field.name}`];
    return [
      `${DATA_TAB_SELECTION_INDENT}${field.name} {`,
      ...nested,
      `${DATA_TAB_SELECTION_INDENT}}`,
    ];
  });
}

export interface FieldDoesNotExistError {
  field: string;
  type: string;
}

const FIELD_DOES_NOT_EXIST = /^Field `([^`]+)` does not exist on type `([^`]+)`\.?$/;

/**
 * Reads the gateway's "Field `x` does not exist on type `T`." errors. Returns
 * them (each pair once) only when every entry is such an error; any other or
 * mixed error list gives `null`, so the caller keeps its existing message.
 */
export function parseFieldDoesNotExistErrors(errors: unknown): FieldDoesNotExistError[] | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const parsed: FieldDoesNotExistError[] = [];
  for (const entry of errors) {
    const message = isRecord(entry) ? entry.message : undefined;
    const match = typeof message === "string" ? FIELD_DOES_NOT_EXIST.exec(message) : null;
    if (!match) return null;
    const [, field, type] = match;
    if (!parsed.some((item) => item.field === field && item.type === type)) {
      parsed.push({ field, type });
    }
  }
  return parsed;
}
