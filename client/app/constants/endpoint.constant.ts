import { getRuntimeEnv } from "@/lib/runtime-env"

export const IDP_BASE_URL = "https://dev-idp.blocksdevelopers.com";

export const API_BASES = {
  COMMUNICATION: "/api",
  CLOUD_CONFIGURATION: "/api",
  UDS: "/api",
  UILM: "/api",
  UTILITIES: "/api",
  CLOUD_BUILD: "/api",
  IDP: "/api",
  IDENTIFIER: "/api",
  LMT: "/api",
  MFA: "/api",
  ALERT: "/api",
  AI: "/api",
  STUDIO: "/api",
} as const;

const DEFAULT_GRAPHQL_GATEWAY_ORIGIN = "https://dev-uds.blocksdevelopers.com" as const;
const DEFAULT_UTILITY_API_ORIGIN = "https://dev-logic.blocksdevelopers.com" as const;

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

/** GraphQL gateway host (execute / reload / ping). Override with `BLOCKS_GRAPHQL_GATEWAY_ORIGIN`; defaults to dev UDS. */
export const getGraphqlGatewayExecuteOrigin = (): string => {
  const fromEnv = trimTrailingSlash(getRuntimeEnv("BLOCKS_GRAPHQL_GATEWAY_ORIGIN").trim());
  if (fromEnv) return fromEnv;
  return DEFAULT_GRAPHQL_GATEWAY_ORIGIN;
};

/** Logic / utility API host (notifications, storage config, SignalR). Override with `BLOCKS_UTILITY_API_ORIGIN`; defaults to dev Logic. */
export const getUtilityApiOrigin = (): string => {
  const fromEnv = trimTrailingSlash(getRuntimeEnv("BLOCKS_UTILITY_API_ORIGIN").trim());
  if (fromEnv) return fromEnv;
  return DEFAULT_UTILITY_API_ORIGIN;
};
