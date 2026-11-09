import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { Card, CardContent } from "@/components/ui-kits/card/card";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { LogsViewer } from "@/service-logs";
import { SERVICES } from "@/service-logs/constants/services-catalog";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useT } from "@seliseblocks/genesis-os/i18n";

export default function PlatformServiceLogsPage() {
  const { t } = useT("data.console");
  const { serviceName } = useParams<{ serviceName: string }>();

  const service = useMemo(
    () => SERVICES.find((item) => item.name === serviceName && item.showInLogs),
    [serviceName],
  );

  setBreadcrumbTitle("/services/logs", t("PLATFORM_SERVICE_LOGS.SERVICE_LOGS"));
  if (serviceName) {
    setBreadcrumbTitle(`/services/logs/${serviceName}`, service?.label || t("PLATFORM_SERVICE_LOGS.LOGS"));
  }

  if (!service) {
    return (
      <main className="flex flex-col gap-6 p-6">
        <PageBreadcrumb breadcrumbIndex={2} />
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t("PLATFORM_SERVICE_LOGS.LOGS_ARE_NOT_CONFIGURED_FOR_THIS")}
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
            label: t("PLATFORM_SERVICE_LOGS.API"),
            serviceName: `blocks-${service.serviceName}-api`,
          },
          {
            id: `blocks-${service.serviceName}-worker`,
            label: t("PLATFORM_SERVICE_LOGS.WORKER"),
            serviceName: `blocks-${service.serviceName}-worker`,
          },
        ]}
        predefinedQueries={[
          t("PLATFORM_SERVICE_LOGS.SHOW_RECENT_ERRORS_FOR", { service: service.label }),
          t("PLATFORM_SERVICE_LOGS.LIST_THE_LATEST_WARNINGS_FOR", { service: service.label }),
          t("PLATFORM_SERVICE_LOGS.SUMMARIZE_UNUSUAL_LOG_PATTERNS_FOR", { service: service.label }),
        ]}
      />
    </main>
  );
}
