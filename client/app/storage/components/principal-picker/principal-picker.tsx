"use client";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import { Label } from "@/components/ui-kits/label/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui-kits/popover/popover";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface PrincipalPickerOption {
  value: string;
  label: string;
  description?: string;
}

export interface PrincipalPickerProps {
  /** Field label, e.g. "Users" / "Roles" / "Organizations". */
  label: string;
  options: PrincipalPickerOption[];
  /** Currently selected values (controlled). */
  selected: string[];
  onChange: (next: string[]) => void;
  isLoading?: boolean;
  /** Disable the picker (e.g. when no search term yet). */
  disabled?: boolean;
  /** Optional helper text shown beneath the field. */
  hint?: string;
  /** Whether to show a search box. Defaults to true. */
  searchable?: boolean;
  placeholder?: string;
  /**
   * Controlled search value. When provided, the search input is fully
   * controlled by the parent (so the same term can drive the IAM query);
   * otherwise the picker keeps an internal value and filters the options
   * client-side.
   */
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
}

/**
 * Multi-select combobox for IAM principals.
 *
 * Backed by Popover + cmdk so it matches the look of the existing
 * single-value Selects elsewhere in the dialog. Selected values render as
 * removable badges below the trigger so the user can see who they are
 * granting to at a glance.
 */
export function PrincipalPicker({
  label,
  options,
  selected,
  onChange,
  isLoading = false,
  disabled = false,
  hint,
  searchable = true,
  placeholder,
  searchTerm,
  onSearchChange,
}: Readonly<PrincipalPickerProps>) {
  const [open, setOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");

  // Controlled search takes precedence; otherwise cmdk filters the options
  // client-side through its own input.
  const isControlledSearch = searchTerm !== undefined && !!onSearchChange;
  const activeSearch = isControlledSearch ? (searchTerm as string) : internalSearch;
  // When the parent owns the search term, the IAM service has already filtered
  // the results, so we disable cmdk's own filtering to avoid double-filtering.
  const shouldCmdFilter = !isControlledSearch;

  // If the source list changes (e.g. a different page of results arrives),
  // drop any selected values that no longer exist there. Keeps the badge
  // list honest without surprising the user with stale ids.
  useEffect(() => {
    if (selected.length === 0) return;
    const valid = new Set(options.map((o) => o.value));
    const filtered = selected.filter((v) => valid.has(v));
    if (filtered.length !== selected.length) onChange(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const selectedOptions = options.filter((o) => selected.includes(o.value));

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const remove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-9 w-full justify-between font-normal"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground">
                  {placeholder ?? "Select…"}
                </span>
              ) : (
                selectedOptions.map((o) => (
                  <Badge
                    key={o.value}
                    variant="secondary"
                    className="cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {o.label}
                    <button
                      type="button"
                      className="ml-1 rounded-sm opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(o.value);
                      }}
                      aria-label={`Remove ${o.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
          <Command shouldFilter={shouldCmdFilter}>
            {searchable && (
              <CommandInput
                placeholder="Search…"
                className="h-9"
                value={activeSearch}
                onValueChange={
                  isControlledSearch
                    ? (onSearchChange as (v: string) => void)
                    : setInternalSearch
                }
              />
            )}
            <CommandList>
              {isLoading ? (
                <div className="flex flex-col gap-2 p-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : options.length === 0 ? (
                <CommandEmpty>No results.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selected.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={`${option.label} ${option.value} ${option.description ?? ""}`}
                        onSelect={() => toggle(option.value)}
                        className="items-start gap-2.5"
                      >
                        <Checkbox checked={isSelected} tabIndex={-1} className="mt-0.5 shrink-0" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{option.label}</span>
                          {option.description ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
