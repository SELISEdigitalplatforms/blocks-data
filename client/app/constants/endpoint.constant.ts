import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_GRAPHQL_GATEWAY_ORIGIN = "https://data.seliseblocks.com" as const;
const DEFAULT_BLOCKS_LOGIC_SITE_ORIGIN =
  "https://logic.seliseblocks.com" as const;

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

const GRAPHQL_GATEWAY_ORIGINS: Record<string, string> = {
  dev: "https://dev-api.blocksdevelopers.com",
  stg: "https://stg-api.blocksdevelopers.com",
  prod: "https://api.seliseblocks.com",
} as const;

const resolveGraphqlGatewayEnvironment = (): string => {
  const appUrl =
    typeof import.meta.env.BLOCKS_APP_URL === "string"
      ? import.meta.env.BLOCKS_APP_URL.trim().toLowerCase()
      : "";

  if (appUrl.includes("dev")) return "dev";
  if (appUrl.includes("stg")) return "stg";
  if (appUrl.includes("data.seliseblocks.com")) return "prod";

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("dev-")
    ) {
      return "dev";
    }
    if (hostname.startsWith("stg-")) {
      return "stg";
    }
    if (hostname.includes("seliseblocks.com")) {
      return "prod";
    }
  }

  return "dev";
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
  IDP: getRuntimeEnv("BLOCKS_IAM_BASE_URL") + "/api",
  IDENTIFIER: "/api",
  LMT: "/api",
  MFA: "/api",
  ALERT: "/api",
  AI: "/api",
  STUDIO: "/api",
  LOGIC: `${BLOCKS_LOGIC_SITE_ORIGIN}/api`,
} as const;

/** GraphQL gateway host (execute / reload / ping). Override with `BLOCKS_GRAPHQL_GATEWAY_ORIGIN`; otherwise resolved from env/domain. */
export const getGraphqlGatewayExecuteOrigin = (): string => {
  const fromEnv = trimTrailingSlash(
    getRuntimeEnv("BLOCKS_GRAPHQL_GATEWAY_ORIGIN").trim(),
  );
  if (fromEnv) return fromEnv;

  const env = resolveGraphqlGatewayEnvironment();
  return GRAPHQL_GATEWAY_ORIGINS[env] || DEFAULT_GRAPHQL_GATEWAY_ORIGIN;
};