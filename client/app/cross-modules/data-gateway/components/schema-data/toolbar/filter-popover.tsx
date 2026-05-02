"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal, X, Plus, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { Calendar } from "@/components/ui-kits/calendar/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { formatDate } from "@/lib/utils";
import type { TemplateField } from "@/cross-modules/data-gateway/models/schema-preview.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Operator =
  | "equals"
  | "not equals"
  | "is one of"
  | "is not one of"
  | "contains"
  | "starts with"
  | "ends with"
  | "greater than"
  | "greater than or equal"
  | "less than"
  | "less than or equal"
  | "before"
  | "after"
  | "on or before"
  | "on or after"
  | "is true"
  | "is false"
  | "is empty"
  | "is not empty"
  | "does not contain";

type FilterCondition = {
  id: string;
  field: string;
  operator: Operator | "";
  value: string;
};

interface FilterPopoverProps {
  fields: TemplateField[];
  appliedFilter: string;
  onApply: (filter: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPERATORS_BY_TYPE: Record<string, Operator[]> = {
  string: [
    "equals",
    "not equals",
    "is one of",
    "is not one of",
    "contains",
    "starts with",
    "ends with",
    "is empty",
    "is not empty",
  ],
  number: [
    "equals",
    "not equals",
    "is one of",
    "is not one of",
    "greater than",
    "greater than or equal",
    "less than",
    "less than or equal",
    "is empty",
    "is not empty",
  ],
  boolean: ["is true", "is false", "is empty", "is not empty"],
  array: ["contains", "does not contain", "is empty", "is not empty"],
  date: [
    "equals",
    "not equals",
    "before",
    "after",
    "on or before",
    "on or after",
    "is empty",
    "is not empty",
  ],
};

const NO_VALUE_OPS: Operator[] = ["is true", "is false", "is empty", "is not empty"];

function resolveFieldCategory(
  field: TemplateField | undefined,
): "string" | "number" | "boolean" | "array" | "date" {
  if (!field) return "string";
  if (field.isArray) return "array";
  const t = (field.type ?? "").toLowerCase();
  if (["int", "integer", "float", "long"].includes(t)) return "number";
  if (t === "boolean") return "boolean";
  if (["datetime", "date", "timestamp"].includes(t)) return "date";
  return "string";
}

// Wraps an ISO string in a sentinel so buildFilterString can replace it with
// ISODate("...") — which is not valid JSON but required by the backend parser.
const ISO_DATE_SENTINEL = "__ISODATE:";
function isoDateMarker(iso: string): string {
  return `${ISO_DATE_SENTINEL}${iso}__`;
}

function conditionToMongo(
  condition: FilterCondition,
  fields: TemplateField[],
): Record<string, unknown> | null {
  const { field, operator, value } = condition;
  if (!field || !operator) return null;

  const fieldDef = fields.find((f) => f.name === field);
  const category = resolveFieldCategory(fieldDef);

  if (!NO_VALUE_OPS.includes(operator as Operator) && value.trim() === "") return null;

  switch (operator) {
    case "equals":
      if (category === "date") return { [field]: isoDateMarker(new Date(value).toISOString()) };
      return { [field]: category === "number" ? Number(value) : value };
    case "not equals":
      if (category === "date") return { [field]: { $ne: isoDateMarker(new Date(value).toISOString()) } };
      return { [field]: { $ne: category === "number" ? Number(value) : value } };
    case "before":
      return { [field]: { $lt: isoDateMarker(new Date(value).toISOString()) } };
    case "after":
      return { [field]: { $gt: isoDateMarker(new Date(value).toISOString()) } };
    case "on or before":
      return { [field]: { $lte: isoDateMarker(new Date(value).toISOString()) } };
    case "on or after":
      return { [field]: { $gte: isoDateMarker(new Date(value).toISOString()) } };
    case "is one of": {
      const items = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (items.length === 0) return null;
      return { [field]: { $in: category === "number" ? items.map(Number) : items } };
    }
    case "is not one of": {
      const items = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (items.length === 0) return null;
      return { [field]: { $nin: category === "number" ? items.map(Number) : items } };
    }
    case "contains":
      return { [field]: { $regex: value, $options: "i" } };
    case "does not contain":
      return { [field]: { $not: { $regex: value, $options: "i" } } };
    case "starts with":
      return { [field]: { $regex: `^${value}`, $options: "i" } };
    case "ends with":
      return { [field]: { $regex: `${value}$`, $options: "i" } };
    case "greater than":
      return { [field]: { $gt: Number(value) } };
    case "greater than or equal":
      return { [field]: { $gte: Number(value) } };
    case "less than":
      return { [field]: { $lt: Number(value) } };
    case "less than or equal":
      return { [field]: { $lte: Number(value) } };
    case "is true":
      return { [field]: true };
    case "is false":
      return { [field]: false };
    case "is empty":
      return { [field]: { $exists: false } };
    case "is not empty":
      return { [field]: { $exists: true } };
    default:
      return null;
  }
}

function buildFilterString(
  conditions: FilterCondition[],
  fields: TemplateField[],
  logic: "and" | "or",
): string {
  const fragments = conditions
    .map((c) => conditionToMongo(c, fields))
    .filter((f): f is Record<string, unknown> => f !== null);
  if (fragments.length === 0) return "";
  const raw =
    fragments.length === 1
      ? JSON.stringify(fragments[0])
      : JSON.stringify(logic === "or" ? { $or: fragments } : { $and: fragments });
  // Replace "__ISODATE:...__" sentinels with ISODate("...") for the backend parser
  return raw.replace(/"__ISODATE:([^"]+)__"/g, 'ISODate("$1")');
}

let _conditionIdSeq = 0;
function emptyCondition(): FilterCondition {
  return { id: String(++_conditionIdSeq), field: "", operator: "", value: "" };
}

function DatePickerInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-36 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span>{selected ? formatDate(selected, true) : "Pick a date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              // Normalize to UTC midnight using local date parts so the stored
              // ISO string is always YYYY-MM-DDT00:00:00.000Z regardless of timezone
              const utcMidnight = new Date(
                Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
              );
              onChange(utcMidnight.toISOString());
            } else {
              onChange("");
            }
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPopover({ fields, appliedFilter, onApply }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftConditions, setDraftConditions] = useState<FilterCondition[]>([emptyCondition()]);
  const [draftLogic, setDraftLogic] = useState<"and" | "or">("and");
  const savedConditionsRef = useRef<FilterCondition[]>([]);
  const savedLogicRef = useRef<"and" | "or">("and");

  const isActive = appliedFilter.trim().length > 0;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      if (appliedFilter && savedConditionsRef.current.length > 0) {
        setDraftConditions(savedConditionsRef.current);
        setDraftLogic(savedLogicRef.current);
      } else {
        setDraftConditions([emptyCondition()]);
        setDraftLogic("and");
      }
    }
    setOpen(next);
  };

  const addCondition = () => {
    setDraftConditions((prev) => [...prev, emptyCondition()]);
  };

  const removeCondition = (id: string) => {
    setDraftConditions((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length === 0 ? [emptyCondition()] : next;
    });
  };

  const updateCondition = (id: string, patch: Partial<FilterCondition>) => {
    setDraftConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if ("field" in patch && patch.field !== c.field) {
          return { ...c, field: patch.field!, operator: "", value: "" };
        }
        if ("operator" in patch && NO_VALUE_OPS.includes(patch.operator as Operator)) {
          return { ...c, ...patch, value: "" };
        }
        return { ...c, ...patch };
      }),
    );
  };

  const handleApply = () => {
    const filterStr = buildFilterString(draftConditions, fields, draftLogic);
    savedConditionsRef.current = draftConditions;
    savedLogicRef.current = draftLogic;
    onApply(filterStr);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftConditions([emptyCondition()]);
    setDraftLogic("and");
    savedConditionsRef.current = [];
    savedLogicRef.current = "and";
    onApply("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Filter"
          className={`h-8 w-8 ${isActive ? "text-primary" : "text-muted-foreground"}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[560px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium">Filters</p>
          {draftConditions.length > 1 && (
            <div className="flex items-center rounded border border-border text-xs">
              <button
                type="button"
                onClick={() => setDraftLogic("and")}
                className={`px-2 py-0.5 ${draftLogic === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => setDraftLogic("or")}
                className={`px-2 py-0.5 ${draftLogic === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                OR
              </button>
            </div>
          )}
        </div>

        {/* Condition rows */}
        <div className="max-h-64 overflow-y-auto px-3 py-2">
          <div className="space-y-2">
            {draftConditions.map((condition) => {
              const fieldDef = fields.find((f) => f.name === condition.field);
              const category = resolveFieldCategory(fieldDef);
              const operatorsForField = condition.field ? OPERATORS_BY_TYPE[category] : [];
              const needsValue =
                condition.operator !== "" && !NO_VALUE_OPS.includes(condition.operator as Operator);

              return (
                <div key={condition.id} className="flex items-center gap-2">
                  {/* Field selector */}
                  <Select
                    value={condition.field}
                    onValueChange={(val) => updateCondition(condition.id, { field: val })}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.name} value={f.name} className="text-xs">
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Operator selector */}
                  <Select
                    value={condition.operator}
                    onValueChange={(val) =>
                      updateCondition(condition.id, { operator: val as Operator })
                    }
                    disabled={!condition.field}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorsForField.map((op) => (
                        <SelectItem key={op} value={op} className="text-xs">
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Value input or spacer */}
                  {needsValue ? (
                    category === "date" ? (
                      <DatePickerInput
                        value={condition.value}
                        onChange={(iso) => updateCondition(condition.id, { value: iso })}
                      />
                    ) : (
                      <Input
                        type={category === "number" ? "number" : "text"}
                        value={condition.value}
                        onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                        placeholder={
                          condition.operator === "is one of" ||
                          condition.operator === "is not one of"
                            ? "a, b, c"
                            : "Value"
                        }
                        className="h-8 w-36 text-xs"
                      />
                    )
                  ) : (
                    <div className="w-36" />
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeCondition(condition.id)}
                    title="Remove condition"
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add condition */}
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add condition
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button type="button" size="sm" className="text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
