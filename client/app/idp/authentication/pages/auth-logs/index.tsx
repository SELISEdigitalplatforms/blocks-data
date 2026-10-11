

import React from "react";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";

import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";

export function AuthLogs() {
  setBreadcrumbTitle("/services/authentication", "Authentication");
  setBreadcrumbTitle("/services/authentication/logs", "Logs");
  return (
    <div>
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: "blocks-idp-api",
            label: "Api",
            serviceName: "blocks-idp-api",
          },
          {
            id: "blocks-idp-worker",
            label: "Worker",
            serviceName: "blocks-idp-worker",
          },
        ]}
        predefinedQueries={[
          "What unusual log patterns appeared in the past 24 hours?",
          "Any errors in the last hour?",
          "Has anyone faced any authentication issues?",
        ]}
      />
    </div>
  );
}
