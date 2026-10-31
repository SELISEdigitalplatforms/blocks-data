import { Button } from "@/components/ui-kits/button/button";
import { Download } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onDownload: () => void;
  onClear: () => void;
}

/** "n selected · Download · Clear", shown while anything on the listing is ticked. */
export function SelectionBar({ count, onDownload, onClear }: Readonly<SelectionBarProps>) {
  if (count <= 0) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-1.5"
    >
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
