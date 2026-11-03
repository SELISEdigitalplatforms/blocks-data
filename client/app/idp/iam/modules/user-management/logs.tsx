import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";
import { useT } from "@seliseblocks/genesis-os/i18n";

export function IamLogs() {
  const { t } = useT("data.idp.iam");
  setBreadcrumbTitle("/services/iam", "IAM");
  setBreadcrumbTitle("/services/iam/logs", t("LOGS.LOGS"));

  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-idp-api",
            label: "API",
            serviceName: "blocks-idp-api",
          },
          {
            id: "blocks-idp-worker",
            label: t("LOGS.WORKER"),
            serviceName: "blocks-idp-worker",
          },
        ]}
        predefinedQueries={[
          t("LOGS.SHOW_RECENT_IAM_USER_MANAGEMENT_ERRORS"),
          t("LOGS.WERE_THERE_UNUSUAL_PERMISSION_OR_ROLE"),
          t("LOGS.ANY_SPIKES_IN_USER_PROVISIONING_ISSUES"),
        ]}
      />
    </div>
  );
}
