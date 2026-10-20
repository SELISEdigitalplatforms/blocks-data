"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useSchemaList } from "../../hooks/use-configuration";
import type { IField, ISchemaDetails } from "../../models/data-service";
import { DEFAULT_REFERENCE_FIELD } from "../../utils/validation-rules.util";

/** Server SchemaType: only Entities hold data a value can point at. */
const ENTITY_SCHEMA_TYPE = "1";

const TEXT_TYPES = ["String", "ID", "Enum"];
const NUMBER_TYPES = ["Int", "Float"];

/**
 * Fields of the target a value of `sourceType` may be matched against: single values of the same
 * kind (text with text, numbers with numbers). ItemId is a text id on every row.
 */
function typeFamily(type: string): string[] {
  if (TEXT_TYPES.includes(type)) return TEXT_TYPES;
  if (NUMBER_TYPES.includes(type)) return NUMBER_TYPES;
  return [];
}

export function compatibleTargetFields(target: ISchemaDetails | undefined, sourceType: string): string[] {
  const family = typeFamily(sourceType);
  const names = (target?.fields ?? [])
    .filter((f: IField) => !f.isArray && family.includes(f.type) && f.name !== DEFAULT_REFERENCE_FIELD)
    .map((f) => f.name);
  return family === TEXT_TYPES ? [DEFAULT_REFERENCE_FIELD, ...names] : names;
}

/**
 * Picks where a Reference rule looks: an Entity schema (searched by name), then one of its
 * fields, ItemId by default.
 */
export function ReferenceTargetPicker({
  projectKey,
  sourceType,
  schemaName,
  fieldName,
  onChange,
}: Readonly<{
  projectKey: string;
  /** Type of the property the rule is on, e.g. String or Int. */
  sourceType: string;
  schemaName: string;
  fieldName: string;
  onChange: (target: { schemaName: string; fieldName: string }) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const keyword = useDebounce(search, 300);
  const { data, isLoading } = useSchemaList({ keyword, pageNo: 1, pageSize: 20, projectKey, schemaType: ENTITY_SCHEMA_TYPE });
  const schemas = data?.data?.items ?? [];

  // The chosen schema's fields: from the search results, or a lookup by its exact name once the search moved on.
  const { data: selectedData } = useSchemaList({ keyword: schemaName, pageNo: 1, pageSize: 20, projectKey, schemaType: ENTITY_SCHEMA_TYPE });
  const selected = [...schemas, ...(selectedData?.data?.items ?? [])].find((s) => s.schemaName === schemaName);
  const fieldOptions = compatibleTargetFields(selected, sourceType);
  const selectedField = selected?.fields.find((f) => f.name === fieldName);
  const showIndexHint = Boolean(fieldName) && fieldName !== DEFAULT_REFERENCE_FIELD && !selectedField?.isUniqueData;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Must exist in schema <span className="text-rose-500">*</span>
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Target schema"
              className="h-9 w-full justify-between font-normal hover:bg-transparent"
            >
              <span className={cn("truncate", !schemaName && "text-muted-foreground")}>{schemaName || "Select a schema…"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) min-w-0 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search schemas…" value={search} onValueChange={setSearch} />
              <CommandList className="max-h-[240px]">
                <CommandEmpty>{isLoading ? "Loading…" : "No entity schema found."}</CommandEmpty>
                <CommandGroup>
                  {schemas.map((schema) => (
                    <CommandItem
                      key={schema.id}
                      value={schema.schemaName}
                      onSelect={() => {
                        onChange({ schemaName: schema.schemaName, fieldName: compatibleTargetFields(schema, sourceType)[0] ?? "" });
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-1.5 h-3.5 w-3.5", schemaName === schema.schemaName ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{schema.schemaName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {schemaName && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Target field</label>
          {fieldOptions.length === 0 ? (
            <p className="text-xs text-rose-500">{schemaName} has no {NUMBER_TYPES.includes(sourceType) ? "number" : "text"} field to match.</p>
          ) : (
            <Select value={fieldName || undefined} onValueChange={(value) => onChange({ schemaName, fieldName: value })}>
              <SelectTrigger className="h-9 w-full" aria-label="Target field">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showIndexHint && (
            <p className="text-xs text-muted-foreground">
              {fieldName} is not unique. The check still works, but is faster when this field is indexed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
