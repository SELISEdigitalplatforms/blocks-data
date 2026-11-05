import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { operationFor, type OperationGroup } from "./operations";

/** "No examples available", with the operation's icon. */
export function PreviewEmptyState({ operationGroup }: { operationGroup: OperationGroup }) {
  const { t } = useT("data.gateway.schema");
  const operation = operationFor(operationGroup);
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-foreground/70">
      <operation.icon className={cn("h-7 w-7 opacity-40", operation.iconColor)} />
      <span className="text-xs text-foreground/70">{t("SCHEMA_PREVIEW_DRAWER.NO_EXAMPLES_AVAILABLE")}</span>
    </div>
  );
}
