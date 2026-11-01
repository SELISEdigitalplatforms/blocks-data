import { Button } from "@/components/ui-kits/button/button";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Download, Share2 } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onShare: () => void;
  /** Why Share is unavailable for this selection; Share is enabled when absent. */
  shareDisabledReason?: string;
  onDownload: () => void;
  onClear: () => void;
}

/** "n selected · Share · Download · Clear", shown while anything on the listing is ticked. */
export function SelectionBar({
  count,
  onShare,
  shareDisabledReason,
  onDownload,
  onClear,
}: Readonly<SelectionBarProps>) {
  const { t } = useT("data.storage");
  if (count <= 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={t("SELECTION_BAR.SELECTION")}
      className="flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-1.5"
    >
      <span className="text-sm font-medium">{t("SELECTION_BAR.COUNT_SELECTED", { count })}</span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onShare}
          disabled={!!shareDisabledReason}
          title={shareDisabledReason}
        >
          <Share2 className="mr-2 h-4 w-4" />
          {t("SELECTION_BAR.SHARE")}
        </Button>
        <Button size="sm" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          {t("common:DOWNLOAD")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          {t("common:CLEAR")}
        </Button>
      </div>
    </div>
  );
}
