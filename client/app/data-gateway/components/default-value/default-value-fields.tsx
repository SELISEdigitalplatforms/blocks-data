"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { DefaultValueKind, IFieldDefaultValue } from "../../models/data-service";
import { DEFAULT_KIND_LABELS, formatDefaultSummary, type DefaultDraft, type OffsetDirection } from "../../utils/default-value.util";

/**
 * The pieces of the default-value panel: the status line, the source picker, the typed inputs, the
 * expression variables, the Now offset and the "will store" preview. Stateless; the panel owns the draft.
 */

export const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground";
export const HINT_CLASS = "text-[11px] leading-relaxed text-muted-foreground";

const CONTROL_CLASS = "h-9 rounded-md border-border/60 bg-background text-[12.5px]";
const CHIP_CLASS =
  "inline-flex h-[22px] items-center rounded-md border border-border/60 bg-muted/30 px-2 font-mono text-[10.5px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";

/** What's stored now: the saved default as a one-liner, or that nothing is. */
export function StatusLine({ saved, fieldName }: Readonly<{ saved: IFieldDefaultValue | null; fieldName: string }>) {
  if (!saved) {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-background px-3 py-2.5 text-xs text-muted-foreground">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span>
          <strong className="font-semibold text-foreground/80">Not set.</strong> {fieldName} is stored only when an insert sends it.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs text-muted-foreground">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold text-foreground/80">Set</strong> · {DEFAULT_KIND_LABELS[saved.kind]}
        <span className="mt-0.5 block truncate font-mono text-xs text-foreground">{formatDefaultSummary(saved)}</span>
      </span>
    </div>
  );
}

/**
 * Fixed value, Expression or Now, as one segmented control. The panel only renders it when more than
 * one kind fits the property; a lone option is no choice.
 */
export function KindPicker({
  kinds,
  value,
  onChange,
}: Readonly<{ kinds: DefaultValueKind[]; value: DefaultValueKind; onChange: (kind: DefaultValueKind) => void }>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cn(LABEL_CLASS, "mb-1.5")}>Source</legend>
      <div className="flex h-8 rounded-md border border-border/60 bg-background p-0.5">
        {kinds.map((kind) => (
          <label
            key={kind}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center rounded-[5px] px-2 text-[11.5px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
              value === kind ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === kind} onChange={() => onChange(kind)} />
            {DEFAULT_KIND_LABELS[kind]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The allowed values of an enum (or true/false) as chips: one click picks, a second click on the
 * same chip clears. A dropdown hid three options behind a click for no reason.
 */
export function ValueChips({
  options,
  value,
  label,
  onChange,
}: Readonly<{ options: string[]; value: string; label: string; onChange: (value: string) => void }>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? "" : option)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-mono text-[12.5px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
              on ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-background text-foreground/80 hover:border-primary/40",
            )}
          >
            {on && <Check className="h-3 w-3" strokeWidth={2.6} aria-hidden />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** How a fixed value of the type is typed: a number, a date-time, or text. */
function inputTypeFor(fieldType: string): "number" | "datetime-local" | "text" {
  if (fieldType === "Int" || fieldType === "Float") return "number";
  return fieldType === "DateTime" ? "datetime-local" : "text";
}

/** One fixed value, entered the way the property's type is. */
export function StaticItemInput({
  fieldType,
  enumValues,
  value,
  label,
  placeholder,
  invalid,
  onChange,
}: Readonly<{
  fieldType: string;
  enumValues: string[];
  value: string;
  label: string;
  placeholder?: string;
  invalid: boolean;
  onChange: (value: string) => void;
}>) {
  if (fieldType === "Boolean" || fieldType === "Enum") {
    return <ValueChips options={fieldType === "Boolean" ? ["true", "false"] : enumValues} value={value} label={label} onChange={onChange} />;
  }
  // A saved date-time comes back as ISO text ("…T09:00:00Z"); the picker shows minutes, read as UTC.
  const shown = fieldType === "DateTime" ? (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(value)?.[0] ?? value) : value;
  return (
    <Input
      type={inputTypeFor(fieldType)}
      aria-label={label}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, fieldType !== "String" && "font-mono", invalid && "border-rose-500")}
    />
  );
}

/** One row of the list: the text and the stable key React tracks it by. */
export interface DraftItem {
  key: string;
  text: string;
}

/** The fixed values or expressions: one input, or several with add and remove for a list property. */
export function ItemsEditor({
  items,
  isExpression,
  isArray,
  fieldType,
  enumValues,
  placeholder,
  invalid,
  onChange,
  onFocusItem,
  onAdd,
  onRemove,
}: Readonly<{
  items: DraftItem[];
  isExpression: boolean;
  isArray: boolean;
  fieldType: string;
  enumValues: string[];
  placeholder: string;
  invalid: boolean;
  onChange: (index: number, text: string) => void;
  onFocusItem: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}>) {
  const itemLabel = (index: number) => {
    const noun = isExpression ? "Expression" : "Value";
    return isArray ? `${noun} ${index + 1}` : noun;
  };
  return (
    <>
      {items.map((item, index) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            {isExpression ? (
              <Input
                aria-label={itemLabel(index)}
                placeholder={placeholder}
                value={item.text}
                onFocus={() => onFocusItem(index)}
                onChange={(e) => onChange(index, e.target.value)}
                className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
              />
            ) : (
              <StaticItemInput
                fieldType={fieldType}
                enumValues={enumValues}
                value={item.text}
                label={itemLabel(index)}
                placeholder={placeholder}
                invalid={invalid}
                onChange={(text) => onChange(index, text)}
              />
            )}
          </div>
          {isArray && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={items.length === 1}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-500 disabled:opacity-30"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => onRemove(index)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {isArray && (
        <Button type="button" variant="outline" size="sm" className="h-7 w-fit gap-1.5 text-[11.5px]" onClick={onAdd}>
          <Plus className="h-3 w-3" />
          Add item
        </Button>
      )}
    </>
  );
}

/** The variables an expression may use: this record's single-value properties, and the signed-in user's values. */
export function expressionVariables(
  schemaName: string,
  fields: Record<string, { isObject: boolean; isArray: boolean }>,
  authNames: readonly string[],
  isArray: boolean,
): { record: string[]; auth: string[] } {
  const record = Object.entries(fields)
    .filter(([, field]) => !field.isObject && !field.isArray)
    .map(([path]) => `{{${schemaName}.${path}}}`);
  // Roles and Permissions are lists: only a list property can take them.
  const auth = authNames.filter((name) => isArray || (name !== "Roles" && name !== "Permissions")).map((name) => `{{Auth.${name}}}`);
  return { record, auth };
}

/** Reads "{{Employee.FirstName}}" as "Employee.FirstName" for a chip. */
const bare = (variable: string) => variable.slice(2, -2);

/**
 * The variables to insert: a few in reach, the rest a click away. The quick row takes the first
 * record properties and the signed-in user's e-mail, since names and e-mails are what most
 * expressions are made of.
 */
export function ExpressionVariables({
  record,
  auth,
  expanded,
  onToggle,
  onInsert,
}: Readonly<{ record: string[]; auth: string[]; expanded: boolean; onToggle: () => void; onInsert: (variable: string) => void }>) {
  const quick = record.slice(0, 3).concat(auth.filter((v) => v === "{{Auth.Email}}"));
  const chip = (variable: string) => (
    <button key={variable} type="button" onClick={() => onInsert(variable)} aria-label={`Insert ${variable}`} className={CHIP_CLASS}>
      {bare(variable)}
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10.5px] text-muted-foreground">Insert</span>
        {quick.map(chip)}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {expanded ? "Fewer" : "All variables"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2.5 rounded-md border border-border/50 bg-background p-3">
          <VariableGroup title="This record">{record.map(chip)}</VariableGroup>
          <VariableGroup title="Signed-in user">{auth.map(chip)}</VariableGroup>
        </div>
      )}
    </div>
  );
}

function VariableGroup({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{title}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const OFFSET_PARTS = [
  { key: "days", label: "Days", unit: "d" },
  { key: "hours", label: "Hours", unit: "h" },
  { key: "minutes", label: "Minutes", unit: "m" },
  { key: "seconds", label: "Seconds", unit: "s" },
] as const;

/** Now's shift: a direction, then days, hours, minutes and seconds on one line. */
export function OffsetInputs({
  direction,
  offset,
  invalid,
  onDirection,
  onChange,
}: Readonly<{
  direction: OffsetDirection;
  offset: DefaultDraft["offset"];
  invalid: boolean;
  onDirection: (direction: OffsetDirection) => void;
  onChange: (offset: DefaultDraft["offset"]) => void;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL_CLASS}>Offset</span>
      <div className="flex items-center gap-1.5">
        <span className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-2.5 font-mono text-[12.5px] text-foreground/80">Now</span>
        <div role="radiogroup" aria-label="Direction" className="flex h-9 rounded-md border border-border/60 bg-background p-0.5">
          {(["+", "-"] as const).map((sign) => (
            <button
              key={sign}
              type="button"
              role="radio"
              aria-checked={direction === sign}
              aria-label={sign === "+" ? "Plus" : "Minus"}
              onClick={() => onDirection(sign)}
              className={cn(
                "w-7 rounded-[5px] font-mono text-[15px] font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
                direction === sign ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {sign === "+" ? "+" : "−"}
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-4 gap-1.5">
          {OFFSET_PARTS.map(({ key, label, unit }) => (
            <div key={key} className="relative flex items-center">
              <Input
                type="text"
                inputMode="numeric"
                aria-label={label}
                value={offset[key]}
                onChange={(e) => onChange({ ...offset, [key]: e.target.value })}
                className={cn(CONTROL_CLASS, "pr-5 pl-2 font-mono", invalid && "border-rose-500")}
              />
              <span aria-hidden className="pointer-events-none absolute right-2 text-[10.5px] text-muted-foreground">
                {unit}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={HINT_CLASS}>Whole numbers. Leave all four at 0 for the insert time itself.</p>
    </div>
  );
}

/** One piece of the preview: literal text, a variable, or a muted aside. */
export interface PreviewPiece {
  text: string;
  tone: "text" | "variable" | "muted";
}

/** What an insert that omits the property would store, as the draft stands. */
export function WillStore({ pieces, caption }: Readonly<{ pieces: PreviewPiece[]; caption: string }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={LABEL_CLASS}>Will store</span>
        <span className="truncate text-[10.5px] text-muted-foreground">{caption}</span>
      </div>
      <div
        data-testid="will-store"
        className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-border/50 bg-background px-3 py-1.5 font-mono text-[12.5px] text-foreground"
      >
        {pieces.map((piece, i) => (
          <span
            // Pieces have no identity of their own; the preview is rebuilt on every change.
            key={`${i}-${piece.text}`}
            className={cn(
              piece.tone === "variable" && "rounded bg-primary/10 px-1.5 py-px text-primary",
              piece.tone === "muted" && "text-muted-foreground",
            )}
          >
            {piece.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The heading over the inputs. */
export function itemsHeading(isArray: boolean, kind: DefaultValueKind): string {
  if (isArray) return kind === "Template" ? "Expressions" : "Values";
  return kind === "Template" ? "Expression" : "Value";
}
