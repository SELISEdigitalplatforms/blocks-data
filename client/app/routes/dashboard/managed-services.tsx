import { ManagedServices } from "@/identifier/pages/services/managed-services";
import { useT } from "@seliseblocks/genesis-os/i18n";

export default function ManagedServicesPage() {
  const { t } = useT("data.console");
  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">{t("DASHBOARD_MANAGED_SERVICES.MANAGED_SERVICES")}</h1>
          <p className="text-muted-foreground">
            {t("DASHBOARD_MANAGED_SERVICES.REGISTER_AND_MONITOR_YOUR_SERVICES")}
          </p>
        </div>
      </div>
      <ManagedServices />
    </main>
  );
}
