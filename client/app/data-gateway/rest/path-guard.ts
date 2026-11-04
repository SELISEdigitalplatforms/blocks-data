/**
 * The security boundary of the REST playground: every path it sends, or receives through a localStorage handoff, is
 * checked here first, so the console's cookies and x-blocks-key can never be sent to another host. Pure and
 * synchronous; the UI maps a refusal to text.
 */

import { routedSegments } from "./route-segments";

export type PathRefusal =
  | "not-relative"
  | "double-slash"
  | "backslash"
  | "dot-segment"
  | "bad-escape"
  | "scheme"
  | "control-or-space"
  | "query-or-fragment"
  | "escapes-base";

export type PathCheck = { ok: true } | { ok: false; refusal: PathRefusal };

const ITEM_ID_PLACEHOLDER = "{itemId}";
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/;
/** The one colon a first segment may hold (spec §5): an entity name and a custom-method verb, e.g. "E:deleteMany". */
const CUSTOM_METHOD = /^[A-Za-z0-9_]{1,50}:[A-Za-z]+$/;

const refuse = (refusal: PathRefusal): PathCheck => ({ ok: false, refusal });

/** `path` carries no query string; `base` is the absolute gateway base without a trailing slash. */
export function checkGatewayPath(path: string, base: string): PathCheck {
  if (!path.startsWith("/")) return refuse("not-relative");
  if (path.includes("\\")) return refuse("backslash");
  if (CONTROL_OR_SPACE.test(path)) return refuse("control-or-space");
  // The query travels separately; a "#" would silently drop it, as fetch treats it as a fragment.
  if (path.includes("?") || path.includes("#")) return refuse("query-or-fragment");
  if (path.includes("//")) return refuse("double-slash");

  const segments = path.split("/").slice(1);
  // Decoded first: URL resolves %2e and %2E%2e as dot segments, so "/E/%2e/1" would be sent as "/E/1".
  for (const segment of routedSegments(path)) {
    if (segment === null) return refuse("bad-escape");
    if (segment === "." || segment === "..") return refuse("dot-segment");
  }
  // Decoded, as the server routes it: "/E%3AdeleteMany" is "/E:deleteMany". The loop above proved it decodes.
  const first = decodeURIComponent(segments[0]);
  if (first.includes(":") && !CUSTOM_METHOD.test(first)) return refuse("scheme");

  try {
    if (!new URL(base + path).href.startsWith(`${base}/`)) return refuse("escapes-base");
  } catch {
    return refuse("escapes-base");
  }
  return { ok: true };
}

export function hasItemIdPlaceholder(path: string): boolean {
  return path.includes(ITEM_ID_PLACEHOLDER);
}

export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}
