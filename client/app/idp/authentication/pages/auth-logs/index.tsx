

import React from "react";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";

import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";
import { useT } from "@seliseblocks/genesis-os/i18n";

export function AuthLogs() {
  const { t } = useT("data.idp.authentication");
  setBreadcrumbTitle("/services/authentication", t("AUTH_LOGS.AUTHENTICATION"));
  setBreadcrumbTitle("/services/authentication/logs", t("AUTH_LOGS.LOGS"));
  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-idp-api",
            label: t("AUTH_LOGS.API"),
            serviceName: "blocks-idp-api",
          },
          {
            id: "blocks-idp-worker",
            label: t("AUTH_LOGS.WORKER"),
            serviceName: "blocks-idp-worker",
          },
        ]}
        predefinedQueries={[
          t("AUTH_LOGS.WHAT_UNUSUAL_LOG_PATTERNS_APPEARED_IN"),
          t("AUTH_LOGS.ANY_ERRORS_IN_THE_LAST_HOUR"),
          t("AUTH_LOGS.HAS_ANYONE_FACED_ANY_AUTHENTICATION"),
        ]}
      />
    </div>
  );
}
