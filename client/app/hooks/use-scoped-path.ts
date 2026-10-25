import { getRuntimeEnv } from "@/lib/runtime-env";
import { useScopedPath } from "@seliseblocks/genesis-os";
import { useParams } from "react-router";

export { useScopedPath };

export const useDataGatewayPath = () => useScopedPath()("data-gateway");
export const useStoragePath = () => useScopedPath()("storage");
export const useDashboardPath = () => useScopedPath()("dashboard");

/** Config pages that live in Blocks OS (secret management). */
export type OsConfigPage = "data-gateway" | "storage";

/**
 * Absolute Blocks OS URL of a config page: `<os base>/app/<projectId>/secret-management/<page>`.
 * Without a project id (non-scoped route) it is `<os base>/app/secret-management/<page>`, which OS
 * resolves to the current project.
 */
export const buildOsSecretManagementUrl = (
  osBaseUrl: string,
  projectId: string | undefined,
  page: OsConfigPage,
): string => {
  const base = osBaseUrl.replace(/\/+$/, "");
  const scope = projectId ? `/app/${encodeURIComponent(projectId)}` : "/app";
  return `${base}${scope}/secret-management/${page}`;
};

/** Where "Configure" opens: the OS page of this config, for the project in the URL (`/app/:itemId/...`). */
export const useOsSecretManagementUrl = (page: OsConfigPage): string => {
  const { itemId } = useParams();
  return buildOsSecretManagementUrl(getRuntimeEnv("BLOCKS_OS_BASE_URL"), itemId, page);
};
