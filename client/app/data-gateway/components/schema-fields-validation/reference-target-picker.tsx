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
import { useReferenceTargets } from "../../hooks/use-configuration";
import type { IReferenceTargetSchema } from "../../models/data-service";
import { DEFAULT_REFERENCE_FIELD } from "../../utils/validation-rules.util";

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

export function compatibleTargetFields(target: { fields?: { name: string; type: string; isArray: boolean }[] } | undefined, sourceType: string): string[] {
  const family = typeFamily(sourceType);
  const names = (target?.fields ?? [])
    .filter((f) => !f.isArray && family.includes(f.type) && f.name !== DEFAULT_REFERENCE_FIELD)
    .map((f) => f.name);
  return family === TEXT_TYPES ? [DEFAULT_REFERENCE_FIELD, ...names] : names;
}

/** The chosen target schema with its fields, looked up by its exact name; undefined until it is known. */
export function useReferenceTarget(schemaName: string): IReferenceTargetSchema | undefined {
  const { data } = useReferenceTargets("", !!schemaName, schemaName);
  const groups = data?.data;
  return [...(groups?.entities ?? []), ...(groups?.systemEntities ?? [])].find((s) => s.schemaName === schemaName);
}

function TargetItem({
  schema,
  selected,
  disabledNote,
  onSelect,
}: Readonly<{ schema: IReferenceTargetSchema; selected: boolean; disabledNote?: string; onSelect: () => void }>) {
  return (
    <CommandItem value={schema.schemaName} disabled={!!disabledNote} onSelect={onSelect} className="items-start">
      <Check className={cn("mr-1.5 mt-0.5 h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate">{schema.schemaName}</span>
          {schema.isSystemEntity && (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">System</span>
          )}
        </span>
        {(disabledNote ?? schema.description) && <span className="truncate text-[11px] text-muted-foreground">{disabledNote ?? schema.description}</span>}
      </span>
    </CommandItem>
  );
}

/**
 * Picks where a Reference or Must not exist in rule looks: an Entity schema, then one of its fields, ItemId by default.
 * Every entity of the project is offered, searched by name and description on the server: the project's own first,
 * then the system entities, each group hidden when nothing in it matches (section 8).
 */
export function ReferenceTargetPicker({
  sourceType,
  schemaName,
  fieldName,
  mustNotExist = false,
  ownSchemaName,
  onChange,
}: Readonly<{
  projectKey?: string;
  /** Type of the property the rule is on, e.g. String or Int. */
  sourceType: string;
  schemaName: string;
  fieldName: string;
  /** A Must not exist in rule: its own schema isn't offered (the Unique flag does that). */
  mustNotExist?: boolean;
  /** The schema the rule is on. */
  ownSchemaName?: string;
  onChange: (target: { schemaName: string; fieldName: string }) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const keyword = useDebounce(search, 300);
  const { data, isLoading } = useReferenceTargets(keyword, open);
  const groups = [
    { heading: "Your entities", schemas: data?.data?.entities ?? [] },
    { heading: "System entities", schemas: data?.data?.systemEntities ?? [] },
  ].filter((group) => group.schemas.length > 0);

  const selected = useReferenceTarget(schemaName);
  const fieldOptions = compatibleTargetFields(selected, sourceType);
  const selectedField = selected?.fields.find((f) => f.name === fieldName);
  const showIndexHint = Boolean(fieldName) && fieldName !== DEFAULT_REFERENCE_FIELD && !!selected && !selectedField?.isUniqueData;
  const isOwn = (name: string) => mustNotExist && !!ownSchemaName && name.toLowerCase() === ownSchemaName.toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {mustNotExist ? "Must not exist in schema" : "Must exist in schema"} <span className="text-rose-500">*</span>
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
              <CommandInput placeholder="Search names and descriptions…" value={search} onValueChange={setSearch} />
              <CommandList className="max-h-[280px]">
                <CommandEmpty>{isLoading ? "Loading…" : "No entity found."}</CommandEmpty>
                {groups.map((group) => (
                  <CommandGroup key={group.heading} heading={`${group.heading} · ${group.schemas.length}`}>
                    {group.schemas.map((schema) => (
                      <TargetItem
                        key={`${schema.isSystemEntity}-${schema.schemaName}`}
                        schema={schema}
                        selected={schemaName === schema.schemaName}
                        disabledNote={isOwn(schema.schemaName) ? "This schema. Use the Unique flag instead" : undefined}
                        onSelect={() => {
                          onChange({ schemaName: schema.schemaName, fieldName: compatibleTargetFields(schema, sourceType)[0] ?? "" });
                          setOpen(false);
                        }}
                      />
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {mustNotExist && ownSchemaName && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {ownSchemaName} isn&apos;t offered here. For no duplicates within {ownSchemaName}, use the Unique flag on the property.
          </p>
        )}
      </div>

      {schemaName && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Target field</label>
          {selected && fieldOptions.length === 0 ? (
            <p className="text-xs text-rose-500">{schemaName} has no {NUMBER_TYPES.includes(sourceType) ? "number" : "text"} field to match.</p>
          ) : (
            <Select value={fieldName || undefined} onValueChange={(value) => onChange({ schemaName, fieldName: value })}>
              <SelectTrigger className="h-9 w-full" aria-label="Target field">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {(selected ? fieldOptions : [fieldName || DEFAULT_REFERENCE_FIELD]).map((name) => (
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
