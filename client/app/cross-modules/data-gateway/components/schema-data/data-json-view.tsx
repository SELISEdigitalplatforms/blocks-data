"use client";

import { CopyToClipboardButton } from "@/components/copy-to-clipboard-button/copy-to-clipboard-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { EyeOff } from "lucide-react";

interface DataJsonViewProps {
  data: Record<string, unknown>[];
  piiFields?: Set<string>;
}

const PII_MASK = "••••••••";

function maskPiiFields(
  item: Record<string, unknown>,
  piiFields: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).map(([key, val]) => [key, piiFields.has(key) ? PII_MASK : val]),
  );
}

function renderJsonLines(item: Record<string, unknown>, piiFields: Set<string>): React.ReactNode {
  const lines = JSON.stringify(item, null, 2).split("\n");
  return lines.map((line, i) => {
    const keyMatch = line.match(/^(\s*)"([^"]+)":/);
    if (keyMatch && piiFields.has(keyMatch[2])) {
      const indent = keyMatch[1];
      const key = keyMatch[2];
      return (
        <span key={i} className="block">
          {indent}
          <span className="text-foreground">&quot;{key}&quot;</span>
          {": "}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            &quot;{PII_MASK}&quot;
            <Tooltip>
              <TooltipTrigger asChild>
                <EyeOff className="inline h-3 w-3 cursor-default" />
              </TooltipTrigger>
              <TooltipContent>
                This field contains personally identifiable information and is masked
              </TooltipContent>
            </Tooltip>
          </span>
          {line.endsWith(",") ? "," : ""}
          {"\n"}
        </span>
      );
    }
    return (
      <span key={i} className="block">
        {line}
        {"\n"}
      </span>
    );
  });
}

export function DataJsonView({ data, piiFields }: DataJsonViewProps) {
  const hasPii = piiFields && piiFields.size > 0;

  return (
    <div className="space-y-2">
      {data.map((item, index) => {
        const maskedItem = hasPii ? maskPiiFields(item, piiFields) : item;
        return (
          <div key={index} className="w-full rounded-md border border-border bg-muted">
            <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
              <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
              <CopyToClipboardButton textToCopy={JSON.stringify(maskedItem, null, 2)}>
                <span />
              </CopyToClipboardButton>
            </div>
            <div className="overflow-x-auto">
              <pre className="min-w-0 whitespace-pre p-4 font-mono text-sm leading-relaxed text-foreground">
                {hasPii ? renderJsonLines(maskedItem, piiFields) : JSON.stringify(item, null, 2)}
              </pre>
            </div>
          </div>
        );
      })}
    </div>
  );
}
