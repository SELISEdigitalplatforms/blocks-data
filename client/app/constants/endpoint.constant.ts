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

/** Absolute origin for GraphQL gateway execute (playground); other UDS APIs stay on the app origin `/api` proxy. */
export const GRAPHQL_GATEWAY_EXECUTE_ORIGIN = "https://dev-api.blocksdevelopers.com" as const;

/** Host for utility notifier REST + SignalR. */
export const getUtilityApiOrigin = (): string => "https://dev-utility.blocksdevelopers.com";

export const toUtilityApiUrl = (path: string): string => {
  const origin = getUtilityApiOrigin().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
};
