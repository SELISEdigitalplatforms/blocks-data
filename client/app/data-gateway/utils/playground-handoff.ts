import { checkGatewayPath } from "../rest/path-guard";
import { gatewayBaseUrl } from "../rest/gateway-base";
import type { RestRequest } from "../rest/rest-client";
import type { RestMethod } from "../rest/request-templates";

export type PlaygroundHandoff =
  ({ protocol: "rest" } & RestRequest) | { protocol: "graphql"; query: string };

const HANDOFF_KEY = "data-gateway-playground-handoff";
const LEGACY_GRAPHQL_KEY = "graphql-playground-query";
const METHODS: readonly RestMethod[] = ["GET", "POST", "PATCH", "PUT", "DELETE"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQueryPairs = (value: unknown): value is [string, string][] =>
  Array.isArray(value) &&
  value.every(
    (pair) =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      typeof pair[0] === "string" &&
      typeof pair[1] === "string",
  );

/** Rebuilds the handoff from validated fields only, so extra properties never travel on. */
function validate(value: unknown): PlaygroundHandoff | null {
  if (!isRecord(value)) return null;

  if (value.protocol === "graphql") {
    // A blank query carries nothing to open, so it is as invalid as a missing one.
    return typeof value.query === "string" && value.query.trim() !== ""
      ? { protocol: "graphql", query: value.query }
      : null;
  }
  if (value.protocol !== "rest") return null;

  const { method, path, query, body } = value;
  if (typeof method !== "string" || !METHODS.includes(method as RestMethod)) return null;
  if (typeof path !== "string" || !checkGatewayPath(path, gatewayBaseUrl()).ok) return null;
  if (!isQueryPairs(query)) return null;
  if (body !== undefined && typeof body !== "string") return null;

  const request: PlaygroundHandoff = {
    protocol: "rest",
    method: method as RestMethod,
    path,
    query: query.map(([key, val]) => [key, val]),
  };
  if (body !== undefined) request.body = body;
  return request;
}

export function writePlaygroundHandoff(handoff: PlaygroundHandoff): void {
  try {
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Storage unavailable or full: the playground simply opens without the handoff.
  }
}

/** Parses the stored handoff without removing it; anything that does not validate is dropped. */
export function peekPlaygroundHandoff(): PlaygroundHandoff | null {
  try {
    const stored = localStorage.getItem(HANDOFF_KEY);
    const legacy = localStorage.getItem(LEGACY_GRAPHQL_KEY);

    if (stored !== null) {
      try {
        const handoff = validate(JSON.parse(stored));
        if (handoff) return handoff;
      } catch {
        // Malformed JSON is dropped like any other invalid value.
      }
    }
    return legacy ? { protocol: "graphql", query: legacy } : null;
  } catch {
    return null;
  }
}

/** Removes both handoff keys, whatever they hold. Best effort: removal can fail where storage is restricted. */
export function clearPlaygroundHandoff(): void {
  for (const key of [HANDOFF_KEY, LEGACY_GRAPHQL_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing more to do; the handoff was already read.
    }
  }
}
