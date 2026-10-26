"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { cn } from "@/lib/utils";
import { Lock, Plus, X } from "lucide-react";
import { BOOLEAN_VALUES, fromDateInput, splitList, toDateInput } from "../../utils/rule-static-value";
import {
  canCompareProperties,
  conditionDraftText,
  conditionRowError,
  fittingProperties,
  newConditionRow,
  operatorLabel,
  operatorsFor,
  rowForField,
  rowForOperator,
  type ConditionDraft,
  type ConditionField,
  type ConditionRow,
} from "../../utils/validation-conditions";

const CONTROL_CLASS = "h-8 rounded-md border-border/60 bg-background text-[12px]";

/** D1: a condition on the record being saved is pink (ONLY WHEN); a filter on another schema is teal (WHERE). */
export const CONDITION_TONE = {
  when: { tag: "bg-[#2A1626] text-[#F2A7D8]", border: "border-[#F2A7D8]/30", label: "Only when" },
  filter: { tag: "bg-[#0A1F1E] text-[#5FD4C4]", border: "border-[#5FD4C4]/30", label: "Where" },
} as const;

export function ConditionTag({ kind }: Readonly<{ kind: "when" | "filter" }>) {
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]", CONDITION_TONE[kind].tag)}>
      {CONDITION_TONE[kind].label}
    </span>
  );
}

/** Toggles for an Enum's values or true/false: one pick, or several for "is one of" (D6). */
function ChoiceToggles({
  options,
  selected,
  multiple,
  invalid,
  label,
  onChange,
}: Readonly<{ options: string[]; selected: string[]; multiple: boolean; invalid: boolean; label: string; onChange: (selected: string[]) => void }>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-md border p-0.5", invalid ? "border-rose-500" : "border-transparent")}>
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (multiple) onChange(on ? selected.filter((s) => s !== option) : [...selected, option]);
              else onChange(on ? [] : [option]);
            }}
            className={cn(
              "h-7 rounded-md border px-2 text-[11.5px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
              on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-background text-foreground/80 hover:border-primary/30",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** The value of one row, entered the way its property's type is (D6). */
function RowValue({
  row,
  field,
  invalid,
  onChange,
}: Readonly<{ row: ConditionRow; field: ConditionField | undefined; invalid: boolean; onChange: (value: string) => void }>) {
  const list = row.operator === "IN" || row.operator === "NOT_IN";
  const type = field?.type ?? "String";
  const choices = type === "Boolean" ? BOOLEAN_VALUES : type === "Enum" ? (field?.enumValues ?? []) : [];
  if (choices.length > 0) {
    return (
      <ChoiceToggles
        options={choices}
        selected={splitList(row.value)}
        multiple={list}
        invalid={invalid}
        label="Condition value"
        onChange={(selected) => onChange(selected.join(", "))}
      />
    );
  }
  if (type === "DateTime" && !list) {
    return (
      <Input
        type="datetime-local"
        aria-label="Condition value"
        value={toDateInput(row.value)}
        onChange={(e) => onChange(fromDateInput(e.target.value))}
        className={cn(CONTROL_CLASS, "font-mono [color-scheme:dark]", invalid && "border-rose-500")}
      />
    );
  }
  return (
    <Input
      aria-label="Condition value"
      inputMode={type === "Int" || type === "Float" ? "decimal" : undefined}
      placeholder={list ? "DE, AT, CH" : type === "Int" || type === "Float" ? "0" : "value"}
      value={row.value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
    />
  );
}

function ConditionRowEditor({
  row,
  fields,
  allowProperties,
  showError,
  onChange,
  onRemove,
}: Readonly<{
  row: ConditionRow;
  fields: ConditionField[];
  allowProperties: boolean;
  showError: boolean;
  onChange: (row: ConditionRow) => void;
  onRemove: () => void;
}>) {
  const field = fields.find((f) => f.path === row.field);
  const others = allowProperties ? fittingProperties(row, fields) : [];
  const canSwitch = others.length > 0 && canCompareProperties(row.operator);
  const asProperty = canSwitch && row.mode === "property";
  const needsValue = row.operator !== "IS_NULL" && row.operator !== "IS_NOT_NULL";
  const error = showError ? conditionRowError(row, fields) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-background/60 p-2">
      <div className="flex items-center gap-1.5">
        <Select value={row.field || undefined} onValueChange={(path) => onChange(rowForField(row, path, fields))}>
          <SelectTrigger className={cn(CONTROL_CLASS, "min-w-0 flex-1")} aria-label="Condition property">
            <SelectValue placeholder="Property" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.path} value={f.path}>
                {f.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={row.operator} onValueChange={(operator) => onChange(rowForOperator(row, operator))}>
          <SelectTrigger className={cn(CONTROL_CLASS, "w-[130px] shrink-0")} aria-label="Condition operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operatorsFor(field).map((operator) => (
              <SelectItem key={operator} value={operator}>
                {operatorLabel(operator, field?.type ?? "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-500" aria-label="Remove condition" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {needsValue ? (
        asProperty ? (
          <Select value={row.other || undefined} onValueChange={(other) => onChange({ ...row, other })}>
            <SelectTrigger className={cn(CONTROL_CLASS, "w-full", error && "border-rose-500")} aria-label="Compared property">
              <SelectValue placeholder="Pick a property" />
            </SelectTrigger>
            <SelectContent>
              {others.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <RowValue row={row} field={field} invalid={!!error} onChange={(value) => onChange({ ...row, value })} />
        )
      ) : (
        <span className="text-[11px] text-muted-foreground">no value needed</span>
      )}

      {canSwitch && (
        <div role="group" aria-label="Compare with" className="flex w-fit gap-0.5 rounded-md border border-border/50 p-0.5 text-[10.5px]">
          {(["value", "property"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={row.mode === mode}
              onClick={() => onChange({ ...row, mode, other: mode === "value" ? "" : row.other })}
              className={cn("rounded px-2 py-0.5", row.mode === mode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {mode === "value" ? "Value" : "Property"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-rose-500">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The rows of an "only when" condition (`kind` "when") or of a Reference filter (`kind` "filter"), joined by one
 * All match / Any matches choice, with the condition in a sentence below (decision 1, D3–D7). A filter compares the
 * other schema's properties with fixed values only. A stored condition with groups is shown read-only (D7).
 */
export function ConditionEditor({
  kind,
  draft,
  fields,
  showErrors,
  targetName,
  onChange,
}: Readonly<{
  kind: "when" | "filter";
  draft: ConditionDraft;
  fields: ConditionField[];
  /** Row errors show once the rule was saved, then stay inline (D6). */
  showErrors: boolean;
  /** The filtered schema, for the sentence. */
  targetName?: string;
  onChange: (draft: ConditionDraft) => void;
}>) {
  const text = conditionDraftText(draft, fields);
  if (draft.locked) {
    return (
      <div className={cn("flex flex-col gap-1.5 rounded-md border bg-background p-2.5", CONDITION_TONE[kind].border)}>
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-mono text-[11.5px] text-foreground/90">{text}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This condition has groups, so it can&apos;t be edited here. Change it through the API or an import. The message and the switch can still be
          changed, and the condition is kept as it is.
        </p>
      </div>
    );
  }

  const join = draft.combine === "OR" ? "or" : "and";
  const update = (rows: ConditionRow[]) => onChange({ ...draft, rows });

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border bg-background p-2.5", CONDITION_TONE[kind].border)}>
      {draft.rows.length >= 2 && (
        <div role="group" aria-label="How the conditions combine" className="flex w-fit gap-0.5 rounded-md border border-border/50 p-0.5 text-[11px]">
          {(["AND", "OR"] as const).map((combine) => (
            <button
              key={combine}
              type="button"
              aria-pressed={draft.combine === combine}
              onClick={() => onChange({ ...draft, combine })}
              className={cn("rounded px-2 py-0.5", draft.combine === combine ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {combine === "AND" ? "All match" : "Any matches"}
            </button>
          ))}
        </div>
      )}

      {draft.rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-1">
          {index > 0 && <span className="pl-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{join}</span>}
          <ConditionRowEditor
            row={row}
            fields={fields}
            allowProperties={kind === "when"}
            showError={showErrors}
            onChange={(next) => update(draft.rows.map((r) => (r.id === row.id ? next : r)))}
            onRemove={() => update(draft.rows.filter((r) => r.id !== row.id))}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit gap-1 border-dashed text-[11.5px]"
        disabled={fields.length === 0}
        onClick={() => update([...draft.rows, newConditionRow(fields)])}
      >
        <Plus className="h-3 w-3" />
        Add condition
      </Button>

      {draft.rows.length > 0 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {kind === "when" ? "Checked only when " : `Counts only ${targetName || "target"} records where `}
          <span className="font-mono text-foreground/90">{text}</span>.
        </p>
      )}
    </div>
  );
}
