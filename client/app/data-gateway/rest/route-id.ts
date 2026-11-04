import type { RestMethod, RestTemplateId } from "./request-templates";
import { parseGatewayRoute, type GatewayVerb } from "./route-segments";

export type RouteId = { entity: string; id: RestTemplateId };

const VERB_ROUTES: Record<GatewayVerb, RestTemplateId> = {
  query: "listByBody",
  insertMany: "insertMany",
  updateMany: "updateMany",
  deleteMany: "deleteMany",
};

const RECORD_ROUTES: Partial<Record<RestMethod, RestTemplateId>> = {
  GET: "getOne",
  PATCH: "update",
  PUT: "upsert",
  DELETE: "delete",
};

const COLLECTION_ROUTES: Partial<Record<RestMethod, RestTemplateId>> = {
  GET: "list",
  POST: "insert",
};

/**
 * The REST route (spec §2) a method and path name, as `parseGatewayRoute` reads the path (decoded, verb exact). `path`
 * has no query string; one trailing slash is ignored. Anything else gives null.
 */
export function routeIdFor(method: RestMethod, path: string): RouteId | null {
  const route = parseGatewayRoute(path);
  if (!route) return null;

  let id: RestTemplateId | undefined;
  if (route.verb) id = method === "POST" ? VERB_ROUTES[route.verb] : undefined;
  else if (route.id !== undefined) id = RECORD_ROUTES[method];
  else id = COLLECTION_ROUTES[method];
  return id ? { entity: route.entity, id } : null;
}
