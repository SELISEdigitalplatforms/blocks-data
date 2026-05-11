"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui-kits/radio-group/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";

interface SortPopoverProps {
  fieldNames: string[];
  appliedSortField: string;
  appliedSortDirection: "asc" | "desc";
  onApply: (field: string, direction: "asc" | "desc") => void;
  onClear: () => void;
}

export function SortPopover({
  fieldNames,
  appliedSortField,
  appliedSortDirection,
  onApply,
  onClear,
}: SortPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftField, setDraftField] = useState("");
  const [draftDirection, setDraftDirection] = useState<"asc" | "desc">("asc");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraftField(appliedSortField);
      setDraftDirection(appliedSortDirection);
    }
    setOpen(next);
  };

  const handleApply = () => {
    onApply(draftField, draftDirection);
    setOpen(false);
  };

  const SortIcon = appliedSortField
    ? appliedSortDirection === "desc"
      ? ArrowDown
      : ArrowUp
    : ArrowUpDown;

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Sort"
            className={`h-8 w-8 ${appliedSortField ? "text-primary" : "text-muted-foreground"}`}
          >
            <SortIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-medium">Sort</p>
            {draftField && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDraftField("")}
              >
                Reset
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto">
            <RadioGroup value={draftField} onValueChange={setDraftField} className="py-1">
              {fieldNames.map((field) => (
                <label
                  key={field}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent"
                >
                  <RadioGroupItem value={field} />
                  <span className="text-xs">{field}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant={draftDirection === "asc" ? "default" : "outline"}
              className="flex-1 text-xs"
              onClick={() => setDraftDirection("asc")}
            >
              Ascending
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draftDirection === "desc" ? "default" : "outline"}
              className="flex-1 text-xs"
              onClick={() => setDraftDirection("desc")}
            >
              Descending
            </Button>
          </div>
          <div className="flex items-center justify-end border-t border-border px-3 py-2">
            <Button type="button" size="sm" className="text-xs" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {appliedSortField && (
        <span className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground">
          {appliedSortField}
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </>
  );
}
