import type { IField, ISchemaDetails } from "../models/data-service";

export type ShapeField = {
  name: string;
  type: string;
  isArray: boolean;
  enumValues?: string[];
  isBase: boolean;
  children?: ShapeField[];
};

export type EntityShape = { name: string; fields: ShapeField[] };

type SchemaLike = Pick<ISchemaDetails, "schemaName" | "fields">;

export const BASE_FIELD_NAMES: ReadonlySet<string> = new Set([
  "ItemId",
  "CreatedDate",
  "CreatedBy",
  "LastUpdatedDate",
  "LastUpdatedBy",
  "IsDeleted",
  "DeletedDate",
  "OrganizationId",
  "Tags",
  "Language",
]);

const MAX_DEPTH = 30;

const SCALAR_TYPES: ReadonlySet<string> = new Set([
  "string",
  "int",
  "integer",
  "long",
  "float",
  "boolean",
  "datetime",
  "enum",
  "geojson",
]);

export function isScalarType(type: string): boolean {
  return SCALAR_TYPES.has(type.toLowerCase());
}

function buildFields(
  fields: IField[],
  schemasByName: Map<string, SchemaLike>,
  path: ReadonlySet<string>,
  depth: number,
): ShapeField[] {
  return fields.map((f) => {
    const shape: ShapeField = {
      name: f.name,
      type: f.type,
      isArray: f.isArray,
      isBase: BASE_FIELD_NAMES.has(f.name),
    };
    if (f.enumValues) shape.enumValues = [...f.enumValues];

    if (isScalarType(f.type)) return shape;

    const dto = schemasByName.get(f.type);
    const inline = f.fields?.length ? f.fields : undefined;
    if (!dto && !inline) {
      // An unknown type is treated as a scalar String.
      shape.type = "String";
      return shape;
    }
    if (depth >= MAX_DEPTH) return shape;

    // A DTO schema wins over inline fields; only DTO names can cycle.
    if (dto) {
      if (path.has(f.type)) return shape;
      shape.children = buildFields(dto.fields, schemasByName, new Set(path).add(f.type), depth + 1);
    } else if (inline) {
      shape.children = buildFields(inline, schemasByName, path, depth + 1);
    }
    return shape;
  });
}

export function buildEntityShape(schema: SchemaLike, allSchemas: SchemaLike[]): EntityShape {
  const schemasByName = new Map(allSchemas.map((s) => [s.schemaName, s]));
  return {
    name: schema.schemaName,
    fields: buildFields(schema.fields, schemasByName, new Set([schema.schemaName]), 1),
  };
}
