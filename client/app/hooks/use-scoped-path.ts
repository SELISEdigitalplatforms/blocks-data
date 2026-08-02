import { useScopedPath } from "@seliseblocks/genesis-os";

export { useScopedPath };

export const useDataGatewayPath = () => useScopedPath()("data-gateway");
export const useStoragePath = () => useScopedPath()("storage");
export const useDashboardPath = () => useScopedPath()("dashboard");
