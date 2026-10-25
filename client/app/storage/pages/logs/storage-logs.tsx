"use client";

import React from "react";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { LogsViewer } from "@/service-logs";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";

export const StorageLogs = () => {
  setBreadcrumbTitle("/services/storage", "Storage");
  setBreadcrumbTitle("/services/storage/logs", "Logs");
  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-data",
            label: "Api",
            serviceName: "blocks-data",
          },
          {
            id: "blocks-data-worker",
            label: "Worker",
            serviceName: "blocks-data-worker",
          },
        ]}
        predefinedQueries={[
          "Has anyone faced any storage issues?",
          "Any errors in storage in the last hour?",
          "Show me all storage issues in the last 7 days",
        ]}
      />
    </div>
  );
};
