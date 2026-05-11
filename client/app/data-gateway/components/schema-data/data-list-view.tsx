"use client";

import { useState } from "react";
import { ChevronRight, EyeOff } from "lucide-react";
import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button/copy-to-clipboard-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";

interface DataListViewProps {
  data: Record<string, unknown>[];
  piiFields?: Set<string>;
}

const PII_MASK = "••••••••";

function CollapsibleNested({
  label,
  children,
  itemCount,
}: {
  label: string;
  children: React.ReactNode;
  itemCount?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span>{label}</span>
        {itemCount !== undefined && (
          <span className="ml-1 text-muted-foreground/60">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>
      {open && <div className="ml-4 mt-1 border-l border-border pl-3">{children}</div>}
    </div>
  );
}

function NestedValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">null</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-blue-500 dark:text-blue-400">{value ? "true" : "false"}</span>;
  }

  if (typeof value !== "object") {
    return <span className="break-all">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="italic text-muted-foreground">[]</span>;
    }
    return (
      <CollapsibleNested label="Array" itemCount={value.length}>
        <div className="space-y-2 pt-1">
          {value.map((item, idx) => (
            <div key={idx}>
              {typeof item === "object" && item !== null ? (
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <NestedRecord record={item as Record<string, unknown>} depth={depth + 1} />
                </div>
              ) : (
                <span className="break-all text-sm">{String(item)}</span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleNested>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <CollapsibleNested label="Object" itemCount={entries.length}>
      <div className="pt-1">
        <NestedRecord record={value as Record<string, unknown>} depth={depth + 1} />
      </div>
    </CollapsibleNested>
  );
}

function NestedRecord({
  record,
  depth = 0,
  piiFields,
}: {
  record: Record<string, unknown>;
  depth?: number;
  piiFields?: Set<string>;
}) {
  return (
    <div className="space-y-1.5">
      {Object.entries(record).map(([key, val]) => {
        const isPII = depth === 0 && piiFields?.has(key);
        const isNested = !isPII && val !== null && typeof val === "object";
        return (
          <div
            key={key}
            className={
              isNested ? "flex flex-col gap-0.5" : "flex flex-col gap-0.5 sm:flex-row sm:gap-2"
            }
          >
            <span className="min-w-[100px] shrink-0 text-xs font-medium text-muted-foreground">
              {key}
            </span>
            <div className="text-sm text-foreground">
              {isPII ? (
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
              ) : (
                <NestedValue value={val} depth={depth} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DataListView({ data, piiFields }: DataListViewProps) {
  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              #{index + 1}
            </span>
            <CopyToClipboardButton textToCopy={JSON.stringify(item, null, 2)}>
              <span />
            </CopyToClipboardButton>
          </div>
          <NestedRecord record={item} piiFields={piiFields} />
        </div>
      ))}
    </div>
  );
}
