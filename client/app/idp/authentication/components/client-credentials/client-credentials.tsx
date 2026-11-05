import { useProjectStore } from "@/store/use-project-store";
import { GRANT_TYPES } from "@blocks-idp/authentication/constants/authentication.constant";
import { useGetAuthConfig } from "@blocks-idp/authentication/hooks/use-auth-config";
import { ClientCredentialList } from "./client-credentials-list";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const ClientCredentials = () => {
  const { t } = useT("data.idp.authentication");
  const { tenantId } = useProjectStore().selectedProject || { tenantId: "" };
  const { data: authConfig, isLoading } = useGetAuthConfig({ projectKey: tenantId });

  const isClientCredentialAllowed = authConfig?.allowedGrantTypes?.includes(GRANT_TYPES.clientCredential);

  return (
    <div>
      {!isLoading && !isClientCredentialAllowed && (
        <div className="text-blocks-error mb-4 flex flex-col items-center justify-center gap-1 rounded-sm border border-base-error bg-blocks-error-100 px-4 py-4 text-base font-normal text-blocks-error-800 md:flex-row">
          {t("CLIENT_CREDENTIALS.PLEASE_SELECT_THE_CLIENT_CREDENTIAL")}
        </div>
      )}

      <div className="relative">
        <ClientCredentialList />
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 top-0 hidden rounded-sm bg-border opacity-80",
            !isLoading && !isClientCredentialAllowed && "block"
          )}
        ></div>
      </div>
    </div>
  );
};
