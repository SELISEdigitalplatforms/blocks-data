"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface ResetButtonProps {
  isActive: boolean;
  onReset: () => void;
}

export function ResetButton({ isActive, onReset }: ResetButtonProps) {
  const { t } = useT("data.gateway.schema");
  if (!isActive) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={onReset}
      title={t("RESET_BUTTON.RESET_ALL_FILTERS")}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {t("common:RESET")}
    </Button>
  );
}
