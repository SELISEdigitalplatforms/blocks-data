/**
 * Transport of the REST playground. It uses `fetch` directly, never the shared `HttpClient`: that client's delete()
 * takes no body, it hides status and headers, it redirects to /login on 401 and it reports every failure to Rollbar.
 * The shared client is only used to refresh the session after a 401.
 */
import { getRuntimeEnv } from "@/lib/runtime-env";
import { configurationService } from "../services/configuration.service";
import { gatewayBaseUrl } from "./gateway-base";
import { checkGatewayPath, type PathRefusal } from "./path-guard";
import { joinRequestLine } from "./request-line";
import type { RestMethod } from "./request-templates";

export { gatewayBaseUrl };

export type RestRequest = {
  method: RestMethod;
  path: string;
  query: [string, string][];
  body?: string;
};

export type RestResponse =
  | {
      kind: "response";
      status: number;
      statusText: string;
      headers: [string, string][];
      contentType: string;
      bodyText: string;
      durationMs: number;
      sizeBytes: number;
    }
  | { kind: "no-response"; reason: string; durationMs: number }
  | { kind: "aborted" };

export class RestPathError extends Error {
  readonly refusal: PathRefusal;

  constructor(refusal: PathRefusal) {
    super(`Gateway path refused: ${refusal}`);
    this.name = "RestPathError";
    this.refusal = refusal;
  }
}

const isAbort = (error: unknown, signal?: AbortSignal) =>
  signal?.aborted === true ||
  (typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError");

async function sendOnce(
  url: string,
  req: RestRequest,
  signal?: AbortSignal,
): Promise<RestResponse> {
  const hasBody = req.method !== "GET" && typeof req.body === "string" && req.body !== "";
  const headers: Record<string, string> = { "x-blocks-key": getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") };
  if (hasBody) headers["Content-Type"] = "application/json";

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: req.method,
      credentials: "include",
      headers,
      body: hasBody ? req.body : undefined,
      signal,
    });
    const bodyText = await response.text();
    return {
      kind: "response",
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      contentType: response.headers.get("content-type") ?? "",
      bodyText,
      durationMs: Math.round(performance.now() - startedAt),
      sizeBytes: new Blob([bodyText]).size,
    };
  } catch (error) {
    if (isAbort(error, signal)) return { kind: "aborted" };
    const message = (error as { message?: unknown } | null)?.message;
    const reason = typeof message === "string" && message ? message : String(error);
    return { kind: "no-response", reason, durationMs: Math.round(performance.now() - startedAt) };
  }
}

/** Throws only `RestPathError` (before any network call); every other outcome is a `RestResponse`. */
export async function sendRestRequest(
  req: RestRequest,
  signal?: AbortSignal,
): Promise<RestResponse> {
  const base = gatewayBaseUrl();
  const check = checkGatewayPath(req.path, base);
  if (!check.ok) throw new RestPathError(check.refusal);

  const url = base + joinRequestLine(req.path, req.query);
  const first = await sendOnce(url, req, signal);
  if (first.kind !== "response" || first.status !== 401) return first;

  try {
    await configurationService.getMockData();
  } catch {
    return first;
  }
  return sendOnce(url, req, signal);
}
