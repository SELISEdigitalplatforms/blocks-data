import type { RestMethod } from "./request-templates";
import { parseGatewayRoute } from "./route-segments";

export const MOCK_DATA_TAG = "mock-data";

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type TaggedRoute = "single" | "many" | null;

/** Matched as the server routes (decoded, verb exact); a segment that does not decode never matches. */
const taggedRoute = (method: RestMethod, path: string): TaggedRoute => {
  const route = method === "POST" ? parseGatewayRoute(path) : null;
  if (!route || route.id !== undefined) return null;
  if (route.verb === undefined) return "single";
  return route.verb === "insertMany" ? "many" : null;
};

/**
 * Routes whose records the playground tags so Clean test data can find them: inserts only, `POST /{entity}` and
 * `POST /{entity}:insertMany`. Not `PUT` (spec §4.3): an upsert can replace a real record, which Clean test data
 * would then delete. `path` has no query string.
 */
export function isMockTaggedRoute(method: RestMethod, path: string): boolean {
  return taggedRoute(method, path) !== null;
}

const withTag = (record: JsonObject): JsonObject => {
  const tags = Array.isArray(record.Tags) ? record.Tags : [];
  return { ...record, Tags: tags.includes(MOCK_DATA_TAG) ? [...tags] : [...tags, MOCK_DATA_TAG] };
};

/** Adds the mock-data tag to the record(s) of a tagged route. Returns new values and never mutates `body`. */
export function tagMockData(method: RestMethod, path: string, body: unknown): unknown {
  const route = taggedRoute(method, path);
  if (route === "many" && Array.isArray(body)) {
    return body.map((item) => (isPlainObject(item) ? withTag(item) : item));
  }
  if (route === "single" && isPlainObject(body)) return withTag(body);
  return body;
}
