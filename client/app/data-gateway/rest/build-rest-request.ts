import { jsonErrorLine } from "./json-error-line";
import { transformJsonLossless, type LosslessRefusal } from "./lossless-json";
import { isMockTaggedRoute, tagMockData } from "./mock-data-tag";
import { checkGatewayPath, hasItemIdPlaceholder, type PathRefusal } from "./path-guard";
import { splitRequestLine } from "./request-line";
import type { RestMethod } from "./request-templates";
import type { RestRequest } from "./rest-client";

/** What the REST workspace edits: the request line holds the path and query string. */
export type RestDraft = { method: RestMethod; requestLine: string; bodyText: string };

/** Why a draft is not sent: the field to show the message under, and its i18n key and values. */
export type RestBuildRefusal = {
  ok: false;
  target: "path" | "body";
  key: string;
  params?: Record<string, string | number>;
};

export type RestBuildResult = { ok: true; req: RestRequest; tagged: boolean } | RestBuildRefusal;

export const ITEM_ID_ERROR_KEY = "REST_PLAYGROUND.ERROR_ITEM_ID";

/** Whether the draft sends a body: any method but GET, with body text that isn't blank. */
export const sendsBody = (draft: RestDraft): boolean => draft.method !== "GET" && draft.bodyText.trim() !== "";

/** The i18n key of a path guard refusal. */
export const pathRefusalKey = (refusal: PathRefusal): string =>
  `REST_PLAYGROUND.PATH_REFUSAL_${refusal.replace(/-/g, "_").toUpperCase()}`;

const pathRefusal = (refusal: PathRefusal): RestBuildRefusal => ({
  ok: false,
  target: "path",
  key: pathRefusalKey(refusal),
});

const bodyRefusal = (key: string, params?: RestBuildRefusal["params"]): RestBuildRefusal => ({
  ok: false,
  target: "body",
  key,
  ...(params && { params }),
});

/** Why a body could not be tagged; it is then not sent. */
const losslessRefusal = (refusal: LosslessRefusal): RestBuildRefusal => {
  switch (refusal.reason) {
    case "duplicate-key":
      return bodyRefusal("REST_PLAYGROUND.ERROR_DUPLICATE_KEY", { key: refusal.key });
    case "too-deep":
      return bodyRefusal("REST_PLAYGROUND.ERROR_TOO_DEEP");
    default:
      return bodyRefusal("REST_PLAYGROUND.ERROR_NOT_TAGGED");
  }
};

/**
 * The request a draft sends, or why it can't be sent. The path must pass the gateway guard against `base` and hold no
 * `{itemId}`; a body must be JSON. On a mock-tagged route the body is tagged losslessly, so integers above 2^53, 1.0,
 * -0 and 1e400 are sent as typed; a body that can't be tagged that way (a duplicate key, or nested too deeply) is
 * refused, since sending it changed or untagged is worse. Pure.
 */
export function buildRestRequest(draft: RestDraft, base: string): RestBuildResult {
  const { path, query } = splitRequestLine(draft.requestLine);
  const check = checkGatewayPath(path, base);
  if (!check.ok) return pathRefusal(check.refusal);
  if (hasItemIdPlaceholder(path)) return { ok: false, target: "path", key: ITEM_ID_ERROR_KEY };

  let body: string | undefined;
  let tagged = false;
  if (sendsBody(draft)) {
    const line = jsonErrorLine(draft.bodyText);
    if (line !== null) return bodyRefusal("REST_PLAYGROUND.ERROR_INVALID_JSON", { line });
    body = draft.bodyText;
    if (isMockTaggedRoute(draft.method, path)) {
      const result = transformJsonLossless(draft.bodyText, (parsed) => {
        const out = tagMockData(draft.method, path, parsed);
        tagged = out !== parsed;
        return out;
      });
      if (!result.ok) return losslessRefusal(result);
      if (tagged) body = result.text;
    }
  }

  return { ok: true, req: { method: draft.method, path, query, ...(body !== undefined && { body }) }, tagged };
}
