"use client";

import React from "react";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { LogsViewer } from "@/service-logs";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const StorageLogs = () => {
  const { t } = useT("data.storage");
  setBreadcrumbTitle("/services/storage", t("STORAGE_LOGS.STORAGE"));
  setBreadcrumbTitle("/services/storage/logs", t("STORAGE_LOGS.LOGS"));
  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-data",
            label: t("STORAGE_LOGS.API"),
            serviceName: "blocks-data",
          },
          {
            id: "blocks-data-worker",
            label: t("STORAGE_LOGS.WORKER"),
            serviceName: "blocks-data-worker",
          },
        ]}
        predefinedQueries={[
          t("STORAGE_LOGS.HAS_ANYONE_FACED_ANY_STORAGE_ISSUES"),
          t("STORAGE_LOGS.ANY_ERRORS_IN_STORAGE_IN_THE"),
          t("STORAGE_LOGS.SHOW_ME_ALL_STORAGE_ISSUES_IN"),
        ]}
      />
    </div>
  );
};
