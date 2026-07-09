"use client";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { BREADCRUMB_CUSTOM_TITLES } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";

export const DataServiceLogs = () => {
  BREADCRUMB_CUSTOM_TITLES["/services/data-gateway"] = "Data Gateway";
  BREADCRUMB_CUSTOM_TITLES["/services/data-gateway/logs"] = "Logs";

  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={3} />
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
          "Has anyone faced any data gateway issues?",
          "Any errors in the last hour?",
          "Highlight unusual Data Gateway activity",
        ]}
      />
    </div>
  );
};
