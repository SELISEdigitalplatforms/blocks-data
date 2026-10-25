"use client";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui-kits/command/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import { cn } from "@/lib/utils";
import { useState } from "react";

/** One value the menu can put into a box: what is inserted, and how it reads in the list. */
export interface ExpressionOption {
  /** Inserted as is, e.g. "{{Employee.FirstName}}". */
  value: string;
  /** e.g. "FirstName", "Email", "Current date & time". */
  label: string;
  /** The muted second column, e.g. "Employee.FirstName" or "when the record is created". */
  detail?: string;
}

export interface ExpressionGroup {
  heading: string;
  options: ExpressionOption[];
}

/**
 * The "{ } Expression" button that sits inside a value box, and the searchable menu it opens:
 * values filled in when a record is created, grouped (this record, signed-in user, date & time).
 * The box decides what fits its property; this only lists and reports the pick.
 */
export function ExpressionMenu({
  groups,
  onPick,
  label,
  className,
}: Readonly<{
  groups: ExpressionGroup[];
  onPick: (option: ExpressionOption) => void;
  /** Accessible name of the button, e.g. "Add an expression to Value". */
  label: string;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  if (groups.every((group) => group.options.length === 0)) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
            open && "bg-primary/20",
            className,
          )}
        >
          <span aria-hidden className="font-mono text-[11px]">
            {"{ }"}
          </span>
          Expression
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-input]]:h-8 **:[[cmdk-input]]:text-[12.5px] **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-1.5">
          <CommandInput placeholder="Search values" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {groups
              .filter((group) => group.options.length > 0)
              .map((group) => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.detail ?? ""} ${option.value}`}
                      onSelect={() => {
                        onPick(option);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate text-[12.5px]">{option.label}</span>
                      {option.detail && <span className="truncate font-mono text-[10.5px] text-muted-foreground">{option.detail}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Puts `insert` into `text` at `caret` (the end when unknown), with a space either side where it
 * would otherwise run into a word. Returns the new text and where the caret goes after it.
 */
export function insertAt(text: string, insert: string, caret: number | null): { text: string; caret: number } {
  const at = caret === null || caret > text.length ? text.length : Math.max(0, caret);
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before && !before.endsWith(" ") ? " " : "";
  const trail = after && !after.startsWith(" ") ? " " : "";
  const next = `${before}${lead}${insert}${trail}${after}`;
  return { text: next, caret: before.length + lead.length + insert.length };
}
