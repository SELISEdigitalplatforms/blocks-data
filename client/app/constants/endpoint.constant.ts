import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_GRAPHQL_GATEWAY_ORIGIN =
  "https://dev-uds.blocksdevelopers.com" as const;
const DEFAULT_BLOCKS_LOGIC_SITE_ORIGIN =
  "https://dev-logic.blocksdevelopers.com" as const;

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");
const tryGetOrigin = (value: string): string => {
  const normalized = trimTrailingSlash(value.trim());
  if (!normalized) return "";

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
};

const resolveBlocksLogicSiteOrigin = (): string => {
  const fromEnv = trimTrailingSlash(
    getRuntimeEnv("BLOCKS_LOGIC_BASE_URL").trim(),
  );
  if (fromEnv) return fromEnv;
  return DEFAULT_BLOCKS_LOGIC_SITE_ORIGIN;
};

/** Logic host origin without `/api` (SignalR hub lives here). Resolved from `BLOCKS_LOGIC_BASE_URL`. */
export const BLOCKS_LOGIC_SITE_ORIGIN = resolveBlocksLogicSiteOrigin();

export const API_BASES = {
  COMMUNICATION: "/api",
  CLOUD_CONFIGURATION: "/api",
  UDS: "/api",
  UILM: "/api",
  UTILITIES: "/api",
  CLOUD_BUILD: "/api",
  IDP: getRuntimeEnv("BLOCKS_IDP_BASE_URL") + "/api",
  IDENTIFIER: "/api",
  LMT: "/api",
  MFA: "/api",
  ALERT: "/api",
  AI: "/api",
  STUDIO: "/api",
  LOGIC: `${BLOCKS_LOGIC_SITE_ORIGIN}/api`,
} as const;

/** GraphQL gateway host (execute / reload / ping). */
export const getGraphqlGatewayExecuteOrigin = (): string => {
  // Keep gateway aligned with runtime API host (e.g., stg-uds) when dedicated env is not provided.
  const fromApiBase = tryGetOrigin(getRuntimeEnv("BLOCKS_API_BASE_URL"));
  if (fromApiBase) return fromApiBase;

  const fromEnv = trimTrailingSlash(
    getRuntimeEnv("BLOCKS_GRAPHQL_GATEWAY_ORIGIN").trim(),
  );
  if (fromEnv) return fromEnv;

  return DEFAULT_GRAPHQL_GATEWAY_ORIGIN;
};
