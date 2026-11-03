import type { RestMethod, RestTemplateId } from "./request-templates";

export type RouteId = { entity: string; id: RestTemplateId };

/**
 * The REST route (spec §2) a method and path name, by exact segment match. `path` has no query string; one trailing
 * slash is ignored. Anything else, including an empty segment, gives null.
 */
export function routeIdFor(method: RestMethod, path: string): RouteId | null {
  if (!path.startsWith("/")) return null;
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").slice(1);
  if (segments.some((segment) => segment === "")) return null;

  const [entity, kind, itemId] = segments;
  const route = (id: RestTemplateId): RouteId => ({ entity, id });

  if (segments.length === 1) {
    if (method === "GET") return route("list");
    if (method === "POST") return route("listByBody");
    return null;
  }
  if (segments.length === 2 && kind === "item") {
    return method === "POST" ? route("insert") : null;
  }
  if (segments.length === 2 && kind === "items") {
    if (method === "POST") return route("insertMany");
    if (method === "PATCH") return route("updateMany");
    if (method === "DELETE") return route("deleteMany");
    return null;
  }
  if (segments.length === 3 && kind === "item" && itemId) {
    if (method === "GET") return route("getOne");
    if (method === "PATCH") return route("update");
    if (method === "PUT") return route("upsert");
    if (method === "DELETE") return route("delete");
  }
  return null;
}
