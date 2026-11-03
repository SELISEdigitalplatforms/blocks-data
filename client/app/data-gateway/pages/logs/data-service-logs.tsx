"use client";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const DataServiceLogs = () => {
  const { t } = useT("data.gateway.analytics");
  setBreadcrumbTitle("/services/data-gateway", t("DATA_SERVICE_LOGS.DATA_GATEWAY"));
  setBreadcrumbTitle("/services/data-gateway/logs", t("DATA_SERVICE_LOGS.LOGS"));

  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={3} />
      <LogsViewer
        services={[
          {
            id: "blocks-data",
            label: t("DATA_SERVICE_LOGS.API"),
            serviceName: "blocks-data",
          },
          {
            id: "blocks-data-worker",
            label: t("DATA_SERVICE_LOGS.WORKER"),
            serviceName: "blocks-data-worker",
          },
        ]}
        predefinedQueries={[
          t("DATA_SERVICE_LOGS.HAS_ANYONE_FACED_ANY_DATA_GATEWAY"),
          t("DATA_SERVICE_LOGS.ANY_ERRORS_IN_THE_LAST_HOUR"),
          t("DATA_SERVICE_LOGS.HIGHLIGHT_UNUSUAL_DATA_GATEWAY"),
        ]}
      />
    </div>
  );
};
