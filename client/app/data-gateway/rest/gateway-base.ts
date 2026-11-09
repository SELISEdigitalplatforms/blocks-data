import { getRuntimeEnv } from "@/lib/runtime-env";
import { GATEWAY_ENDPOINTS } from "../constants/endpoint.constant";

/** Absolute gateway base, without a trailing slash. Kept apart from the HTTP client so callers can use it alone. */
export function gatewayBaseUrl(): string {
  const origin = (getRuntimeEnv("BLOCKS_DATA_BASE_URL") || window.location.origin).replace(
    /\/+$/,
    "",
  );
  return `${origin}${GATEWAY_ENDPOINTS.EXECUTE}`;
}
