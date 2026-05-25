import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { Card, CardContent } from "@/components/ui-kits/card/card";
import { BREADCRUMB_CUSTOM_TITLES } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";
import { SERVICES } from "@/service-logs/constants/services-catalog";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

export default function PlatformServiceLogsPage() {
  const { serviceName } = useParams<{ serviceName: string }>();

  const service = useMemo(
    () => SERVICES.find((item) => item.name === serviceName && item.showInLogs),
    [serviceName],
  );

  BREADCRUMB_CUSTOM_TITLES["/services/logs"] = "Service logs";
  if (serviceName) {
    BREADCRUMB_CUSTOM_TITLES[`/services/logs/${serviceName}`] = service?.label || "Logs";
  }

  if (!service) {
    return (
      <main className="flex flex-col gap-6 p-6">
        <PageBreadcrumb breadcrumbIndex={2} />
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Logs are not configured for this service.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <PageBreadcrumb breadcrumbIndex={2} />
      <LogsViewer
        services={[
          {
            id: `blocks-${service.serviceName}-api`,
            label: "Api",
            serviceName: `blocks-${service.serviceName}-api`,
          },
          {
            id: `blocks-${service.serviceName}-worker`,
            label: "Worker",
            serviceName: `blocks-${service.serviceName}-worker`,
          },
        ]}
        predefinedQueries={[
          `Show recent errors for ${service.label}`,
          `List the latest warnings for ${service.label}`,
          `Summarize unusual log patterns for ${service.label}`,
        ]}
      />
    </main>
  );
}
