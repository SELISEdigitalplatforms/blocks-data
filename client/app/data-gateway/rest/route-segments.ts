/**
 * A path's segments as the server routes them: ASP.NET matches routes case-insensitively on the percent-decoded
 * path, so each segment is decoded and lower-cased. Empty segments are dropped; a segment that does not decode is
 * null, and each caller decides which side is safe for it. `path` has no query string.
 */
export function routedSegments(path: string): (string | null)[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch {
        return null;
      }
    });
}

export const GATEWAY_VERBS = ["query", "insertMany", "updateMany", "deleteMany"] as const;

export type GatewayVerb = (typeof GATEWAY_VERBS)[number];

/** A path in one of the spec §2 shapes: `/{entity}`, `/{entity}/{id}` or `/{entity}:{verb}`. */
export type GatewayRoute = { entity: string; id?: string; verb?: GatewayVerb };

const isGatewayVerb = (value: string): value is GatewayVerb => (GATEWAY_VERBS as readonly string[]).includes(value);

const decoded = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/**
 * The spec §2 shape a path names, after percent-decoding; the entity keeps its case and the verb matches exactly, as
 * the server's custom-method switch does. One trailing slash is ignored; any other shape (an empty or undecodable
 * segment, a third segment, an unknown or wrongly cased verb, a second `:`) gives null. `path` has no query string.
 */
export function parseGatewayRoute(path: string): GatewayRoute | null {
  if (!path.startsWith("/")) return null;
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").slice(1).map(decoded);
  if (segments.length > 2 || segments.some((segment) => !segment)) return null;

  const [first, id] = segments as string[];
  const colon = first.indexOf(":");
  if (colon === -1) return id === undefined ? { entity: first } : { entity: first, id };

  const entity = first.slice(0, colon);
  const verb = first.slice(colon + 1);
  if (id !== undefined || !entity || !isGatewayVerb(verb)) return null;
  return { entity, verb };
}
