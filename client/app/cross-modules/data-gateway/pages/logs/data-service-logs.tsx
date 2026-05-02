"use client";

import React from "react";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { BREADCRUMB_CUSTOM_TITLES } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@blocks-lmt/components";

export const DataServiceLogs = () => {
  BREADCRUMB_CUSTOM_TITLES["/services/data-gateway"] = "Data Gateway";
  BREADCRUMB_CUSTOM_TITLES["/services/data-gateway/logs"] = "Logs";

  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-uds-api",
            label: "Api",
            serviceName: "blocks-uds-api",
          },
          {
            id: "blocks-uds-worker",
            label: "Worker",
            serviceName: "blocks-uds-worker",
          },
        ]}
        predefinedQueries={[
          "Has anyone faced any data gateway issues?",
          "Any errors in the last hour?",
          "Highlight unusual Data Gateway activity",
        ]}
      />
    </div>
  );
};
