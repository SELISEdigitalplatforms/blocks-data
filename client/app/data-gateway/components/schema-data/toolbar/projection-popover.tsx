"use client";

import { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";

interface ProjectionPopoverProps {
  fieldNames: string[];
  appliedFields: string[];
  onApply: (fields: string[]) => void;
}

export function ProjectionPopover({ fieldNames, appliedFields, onApply }: ProjectionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftFields, setDraftFields] = useState<string[]>([]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraftFields(appliedFields.length > 0 ? appliedFields : fieldNames);
    }
    setOpen(next);
  };

  const handleApply = () => {
    // All checked → no projection (show all)
    const applied = draftFields.length === fieldNames.length ? [] : draftFields;
    onApply(applied);
    setOpen(false);
  };

  const toggleAll = () =>
    setDraftFields(draftFields.length === fieldNames.length ? [] : fieldNames);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Column"
          className={`h-8 w-8 ${appliedFields.length > 0 ? "text-primary" : "text-muted-foreground"}`}
        >
          <Columns3 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium">Column</p>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={toggleAll}
          >
            {draftFields.length === fieldNames.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {fieldNames.map((field) => (
            <label
              key={field}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent"
            >
              <Checkbox
                checked={draftFields.includes(field)}
                onCheckedChange={(checked) =>
                  setDraftFields((prev) =>
                    checked ? [...prev, field] : prev.filter((f) => f !== field),
                  )
                }
              />
              <span className="text-xs">{field}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end border-t border-border px-3 py-2">
          <Button type="button" size="sm" className="text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
