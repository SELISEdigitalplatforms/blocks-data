import { useScopedPath } from "@seliseblocks/blocks-kit";

export { useScopedPath };

export const useDataGatewayPath = () => useScopedPath()("data-gateway");
export const useStoragePath = () => useScopedPath()("storage");
export const useDashboardPath = () => useScopedPath()("dashboard");
