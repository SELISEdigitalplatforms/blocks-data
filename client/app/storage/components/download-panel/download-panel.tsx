import { Button } from "@/components/ui-kits/button/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileArchive,
  Loader2,
  X,
} from "lucide-react";
import type { ZipDownloadRow } from "../../models/zip-download.model";
import { useZipDownloadStore } from "../../store/use-zip-download-store";
import { formatSize } from "../../utils/format-size";

const getHeaderText = (rows: ZipDownloadRow[]): string => {
  const preparing = rows.filter((row) => row.status === "preparing").length;
  if (preparing === 1) return "Preparing download";
  if (preparing > 1) return `Preparing ${preparing} downloads`;
  if (rows.every((row) => row.status === "failed")) return "Download failed";
  return "Download started";
};

function StatusIcon({ status }: { status: ZipDownloadRow["status"] }) {
  if (status === "preparing") {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Preparing" />;
  }
  if (status === "started") {
    return <CheckCircle2 className="h-5 w-5 text-green-600" aria-label="Started" />;
  }
  return <AlertTriangle className="h-5 w-5 text-destructive" aria-label="Failed" />;
}

function DownloadRow({ row }: { row: ZipDownloadRow }) {
  const startedDetail =
    row.status === "started" && row.zipName
      ? `${row.zipName} · ${formatSize(row.totalBytes)}`
      : undefined;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FileArchive className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{row.label}</p>
        {startedDetail ? (
          <p className="truncate text-xs text-muted-foreground">{startedDetail}</p>
        ) : null}
        {row.status === "failed" && row.error ? (
          <p className="text-xs text-destructive">{row.error}</p>
        ) : null}
      </div>
      <span className="shrink-0">
        <StatusIcon status={row.status} />
      </span>
    </li>
  );
}

export function DownloadPanel() {
  const rows = useZipDownloadStore((state) => state.rows);
  const collapsed = useZipDownloadStore((state) => state.collapsed);
  const toggleCollapsed = useZipDownloadStore((state) => state.toggleCollapsed);
  const close = useZipDownloadStore((state) => state.close);

  if (rows.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Downloads"
      className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card text-foreground shadow-lg"
    >
      <div className="flex items-center justify-between bg-muted px-4 py-2">
        <h2 className="text-sm font-medium">{getHeaderText(rows)}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close" onClick={close}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {collapsed ? null : (
        <ul className="max-h-64 divide-y overflow-y-auto">
          {rows.map((row) => (
            <DownloadRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
