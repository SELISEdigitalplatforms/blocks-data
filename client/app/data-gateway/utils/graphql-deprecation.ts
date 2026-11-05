import { getRuntimeEnv, isPlaceholder } from "@/lib/runtime-env";

/** True once the server sets `DataGateway:GraphQL:DeprecatedSince`; drives the `deprecated` tags only. */
export const isGraphQLDeprecated = (): boolean => {
  const value = getRuntimeEnv("BLOCKS_GRAPHQL_DEPRECATED_SINCE").trim();
  return value !== "" && !isPlaceholder(value);
};
