import { isScalarType, type EntityShape, type ShapeField } from "./entity-shape";
import { sampleValue } from "./sample-values";

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RestTemplateId =
  | "list"
  | "listByBody"
  | "getOne"
  | "insert"
  | "insertMany"
  | "update"
  | "upsert"
  | "updateMany"
  | "delete"
  | "deleteMany";

export type RestRequestTemplate = {
  group: "query" | "insert" | "update" | "delete";
  id: RestTemplateId;
  method: RestMethod;
  /** Relative to the gateway base, e.g. "/RT_Blocklist/item/{itemId}". */
  path: string;
  query: [string, string][];
  body?: unknown;
};

const ITEM_ID_PLACEHOLDER = "{itemId}";
const MAX_SELECT_FIELDS = 5;

// Candidates for where, order and select. GeoJson is excluded: the server refuses sorting by an
// object, and GeoJson filters take near/within rather than eq.
const ownScalars = (shape: EntityShape): ShapeField[] =>
  shape.fields.filter(
    (f) => !f.isBase && !f.isArray && isScalarType(f.type) && f.type.toLowerCase() !== "geojson",
  );

function whereFilter(shape: EntityShape): Record<string, { eq: unknown }> {
  const scalars = ownScalars(shape);
  const field = scalars.find((f) => f.type.toLowerCase() === "string") ?? scalars[0];
  if (!field) return { ItemId: { eq: ITEM_ID_PLACEHOLDER } };
  return { [field.name]: { eq: sampleValue(field) } };
}

function sampleRecord(shape: EntityShape): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of shape.fields) {
    if (!field.isBase) record[field.name] = sampleValue(field);
  }
  record.Tags = [];
  return record;
}

export function buildRestRequests(shape: EntityShape): RestRequestTemplate[] {
  const base = `/${shape.name}`;
  const itemPath = `${base}/item/${ITEM_ID_PLACEHOLDER}`;
  const scalars = ownScalars(shape);
  const orderField = scalars[0];

  const listQuery: [string, string][] = [
    ["pageNo", "1"],
    ["pageSize", "10"],
  ];
  if (orderField) listQuery.push(["order", `${orderField.name}:ASC`]);
  listQuery.push(["includeTotalCount", "true"]);

  const selectNames = scalars.slice(0, MAX_SELECT_FIELDS).map((f) => f.name);
  const getOneQuery: [string, string][] = selectNames.length
    ? [["select", selectNames.join(",")]]
    : [];

  const listBody: Record<string, unknown> = { where: whereFilter(shape) };
  if (orderField) listBody.order = [{ field: orderField.name, direction: "ASC" }];
  listBody.paging = { pageNo: 1, pageSize: 10 };
  listBody.includeTotalCount = true;

  return [
    { group: "query", id: "list", method: "GET", path: base, query: listQuery },
    { group: "query", id: "listByBody", method: "POST", path: base, query: [], body: listBody },
    { group: "query", id: "getOne", method: "GET", path: itemPath, query: getOneQuery },
    {
      group: "insert",
      id: "insert",
      method: "POST",
      path: `${base}/item`,
      query: [],
      body: sampleRecord(shape),
    },
    {
      group: "insert",
      id: "insertMany",
      method: "POST",
      path: `${base}/items`,
      query: [],
      body: [sampleRecord(shape), sampleRecord(shape)],
    },
    {
      group: "update",
      id: "update",
      method: "PATCH",
      path: itemPath,
      query: [],
      body: sampleRecord(shape),
    },
    {
      group: "update",
      id: "upsert",
      method: "PUT",
      path: itemPath,
      query: [],
      body: sampleRecord(shape),
    },
    {
      group: "update",
      id: "updateMany",
      method: "PATCH",
      path: `${base}/items`,
      query: [],
      body: { where: whereFilter(shape), input: sampleRecord(shape) },
    },
    { group: "delete", id: "delete", method: "DELETE", path: itemPath, query: [] },
    {
      group: "delete",
      id: "deleteMany",
      method: "DELETE",
      path: `${base}/items`,
      query: [],
      body: { where: whereFilter(shape) },
    },
  ];
}

type JsonSchema = Record<string, unknown>;

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

function elementSchema(field: ShapeField): JsonSchema {
  switch (field.type.toLowerCase()) {
    case "string":
      return { type: "string" };
    case "int":
    case "integer":
    case "long":
      return { type: "integer" };
    case "float":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "datetime":
      return { type: "string", format: "date-time" };
    case "enum":
      return field.enumValues?.length
        ? { type: "string", enum: field.enumValues }
        : { type: "string" };
    case "geojson":
      return { type: "object" };
    default:
      return field.children?.length
        ? {
            type: "object",
            properties: Object.fromEntries(field.children.map((c) => [c.name, fieldSchema(c)])),
            additionalProperties: false,
          }
        : { type: "object" };
  }
}

function fieldSchema(field: ShapeField): JsonSchema {
  const element = elementSchema(field);
  return field.isArray ? { type: "array", items: element } : element;
}

function recordSchema(shape: EntityShape): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const field of shape.fields) {
    if (!field.isBase) properties[field.name] = fieldSchema(field);
  }
  properties.Tags = { type: "array", items: { type: "string" } };
  return { type: "object", properties, additionalProperties: false };
}

/** JSON Schema (draft-07) for the request body of a template; null for routes without a body. */
export function buildBodyJsonSchema(shape: EntityShape, id: RestTemplateId): object | null {
  switch (id) {
    case "listByBody":
      return {
        $schema: DRAFT_07,
        type: "object",
        properties: {
          where: { type: "object" },
          order: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                direction: { type: "string", enum: ["ASC", "DESC"] },
              },
              additionalProperties: false,
            },
          },
          select: { type: "array", items: { type: "string" } },
          paging: {
            type: "object",
            properties: { pageNo: { type: "integer" }, pageSize: { type: "integer" } },
            additionalProperties: false,
          },
          includeTotalCount: { type: "boolean" },
        },
        additionalProperties: false,
      };
    case "insert":
    case "update":
    case "upsert":
      return { $schema: DRAFT_07, ...recordSchema(shape) };
    case "insertMany":
      return { $schema: DRAFT_07, type: "array", items: recordSchema(shape) };
    case "updateMany":
      return {
        $schema: DRAFT_07,
        type: "object",
        properties: { where: { type: "object" }, input: recordSchema(shape) },
        additionalProperties: false,
      };
    case "deleteMany":
      return {
        $schema: DRAFT_07,
        type: "object",
        properties: { where: { type: "object" } },
        additionalProperties: false,
      };
    default:
      return null;
  }
}

const screamingSnake = (id: RestTemplateId) => id.replace(/([A-Z])/g, "_$1").toUpperCase();

export const templateTitleKey = (id: RestTemplateId): string =>
  `REST_TEMPLATES.${screamingSnake(id)}_TITLE`;

export const templateDescriptionKey = (id: RestTemplateId): string =>
  `REST_TEMPLATES.${screamingSnake(id)}_DESCRIPTION`;
