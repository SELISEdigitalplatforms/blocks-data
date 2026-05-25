"use client";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button/copy-to-clipboard-button";
import { EyeOff } from "lucide-react";
import { readonlyPropertyNames } from "../../constants/input-restrictions";

interface DataTableViewProps {
  data: Record<string, unknown>[];
  piiFields?: Set<string>;
}

const TOOLTIP_MAX_LENGTH = 300;
const PII_MASK = "••••••••";

function renderCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function truncateTooltip(text: string): string {
  if (text.length <= TOOLTIP_MAX_LENGTH) return text;
  return text.slice(0, TOOLTIP_MAX_LENGTH) + "…";
}

export function DataTableView({ data, piiFields }: DataTableViewProps) {
  const rawColumns = data.length > 0 ? Object.keys(data[0]) : [];
  const columns = [
    ...rawColumns.filter((c) => c === "ItemId"),
    ...rawColumns.filter((c) => c !== "ItemId" && !readonlyPropertyNames.includes(c)),
    ...rawColumns.filter((c) => c !== "ItemId" && readonlyPropertyNames.includes(c)),
  ];

  return (
    <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto rounded-md border border-border">
      <table className="w-max min-w-full caption-bottom text-sm">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-10 shrink-0 bg-background text-muted-foreground">#</TableHead>
            {columns.map((col) => (
              <TableHead
                key={col}
                className="min-w-[160px] whitespace-nowrap bg-background font-medium"
              >
                <span className="flex items-center gap-1.5">
                  {col}
                  {piiFields?.has(col) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>PII — data is masked</TooltipContent>
                    </Tooltip>
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIdx) => (
            <TableRow key={rowIdx}>
              <TableCell className="text-xs text-muted-foreground">{rowIdx + 1}</TableCell>
              {columns.map((col) => {
                if (piiFields?.has(col)) {
                  return (
                    <TableCell key={col} className="min-w-[160px] align-top text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span>{PII_MASK}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <EyeOff className="h-3.5 w-3.5 shrink-0 cursor-default" />
                          </TooltipTrigger>
                          <TooltipContent>
                            This field contains personally identifiable information and is masked
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableCell>
                  );
                }

                const raw = row[col];
                const displayText = renderCellValue(raw);
                const isComplex = typeof raw === "object" && raw !== null;

                return (
                  <TableCell key={col} className="min-w-[160px] align-top text-sm">
                    <CopyToClipboardButton textToCopy={displayText} isHoverable>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`block max-w-[200px] truncate ${isComplex ? "text-muted-foreground" : ""}`}
                          >
                            {displayText}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="max-w-xs break-words font-mono text-xs"
                        >
                          {truncateTooltip(displayText)}
                        </TooltipContent>
                      </Tooltip>
                    </CopyToClipboardButton>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}
