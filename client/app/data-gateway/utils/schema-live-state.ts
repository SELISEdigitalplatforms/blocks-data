import { ISchemaDetails } from "../models/data-service";

/**
 * How a schema's drafts differ from what the live version serves:
 * - "not-live": the live version doesn't contain the schema at all
 * - "unpublished": it does, but the schema has changes the live version
 *   doesn't include (fields, validations, policies, rules, access, indexes)
 * - null: the schema matches the live version, or the live version is unknown
 */
export type SchemaLiveState = "not-live" | "unpublished" | null;

export const SCHEMA_LIVE_STATE_LABELS: Record<Exclude<SchemaLiveState, null>, string> = {
  "not-live": "Not live",
  unpublished: "Unpublished changes",
};

export function schemaLiveState(
  schema: Pick<ISchemaDetails, "id" | "isLive">,
  pendingSchemaIds: ReadonlySet<string>,
): SchemaLiveState {
  // Unknown without a live version; marking everything would say nothing.
  if (schema.isLive === null || schema.isLive === undefined) return null;
  if (!schema.isLive) return "not-live";
  return pendingSchemaIds.has(schema.id) ? "unpublished" : null;
}
