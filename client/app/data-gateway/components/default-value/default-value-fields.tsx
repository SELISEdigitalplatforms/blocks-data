"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import { useId, useRef } from "react";
import type { IFieldDefaultValue } from "../../models/data-service";
import { describeNow, formatDefaultSummary, type DefaultDraft, type OffsetDirection } from "../../utils/default-value.util";
import { ExpressionMenu, insertAt, type ExpressionGroup, type ExpressionOption } from "../primitives";

/**
 * The pieces of the default-value panel: the status line, the one value box (typed text with the
 * "{ } Expression" menu inside it), the current date & time card, and the "will store" preview.
 * Stateless; the panel owns the draft.
 */

export const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground";
export const HINT_CLASS = "text-[11px] leading-relaxed text-muted-foreground";

const CONTROL_CLASS = "h-9 rounded-md border-border/60 bg-background text-[12.5px]";

/** What the Expression menu returns for "Current date & time": not inserted text, it switches the box. */
export const CURRENT_DATE_TIME = "@current-date-time";

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
        <strong className="font-semibold text-foreground/80">Set</strong>
        <span className={cn("mt-0.5 block truncate text-xs text-foreground", saved.kind !== "Now" && "font-mono")}>{formatDefaultSummary(saved)}</span>
      </span>
    </div>
  );
}

/** "Fixed" or "Filled at insert time" beside the VALUE label, for properties that can take either. */
export function ModeBadge({ dynamic }: Readonly<{ dynamic: boolean }>) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-px text-[10.5px] font-semibold",
        dynamic ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
      )}
    >
      {dynamic ? "Filled at insert time" : "Fixed"}
    </span>
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

/** How a value of the type is typed: a number, a date-time, or text. */
function inputTypeFor(fieldType: string): "number" | "datetime-local" | "text" {
  if (fieldType === "Int" || fieldType === "Float") return "number";
  return fieldType === "DateTime" ? "datetime-local" : "text";
}

/**
 * One value box: the input the property's type calls for, with the "{ } Expression" button inside
 * it when something dynamic fits. A picked variable goes in at the caret, so fixed text and record
 * values mix in one line; "Current date & time" is handed to `onUseNow` instead.
 */
export function ValueBox({
  fieldType,
  enumValues,
  value,
  label,
  placeholder,
  invalid,
  groups,
  onChange,
  onUseNow,
}: Readonly<{
  fieldType: string;
  enumValues: string[];
  value: string;
  label: string;
  placeholder?: string;
  invalid: boolean;
  /** What the Expression menu offers; empty for types with nothing dynamic. */
  groups: ExpressionGroup[];
  onChange: (value: string) => void;
  onUseNow?: () => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Where the caret last was, so a pick lands there even though the menu took focus.
  const caret = useRef<number | null>(null);

  if (fieldType === "Boolean" || fieldType === "Enum") {
    return <ValueChips options={fieldType === "Boolean" ? ["true", "false"] : enumValues} value={value} label={label} onChange={onChange} />;
  }

  const hasMenu = groups.some((group) => group.options.length > 0);
  const remember = () => {
    caret.current = inputRef.current?.selectionStart ?? null;
  };
  const pick = (option: ExpressionOption) => {
    if (option.value === CURRENT_DATE_TIME) {
      onUseNow?.();
      return;
    }
    const next = insertAt(value, option.value, caret.current);
    onChange(next.text);
    caret.current = next.caret;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange?.(next.caret, next.caret);
    });
  };
  // A saved date-time comes back as ISO text ("…T09:00:00Z"); the picker shows minutes, read as UTC.
  const shown = fieldType === "DateTime" ? (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(value)?.[0] ?? value) : value;

  return (
    <div className="relative flex items-center">
      <Input
        ref={inputRef}
        type={inputTypeFor(fieldType)}
        aria-label={label}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          onChange(e.target.value);
          remember();
        }}
        onSelect={remember}
        onKeyUp={remember}
        onClick={remember}
        className={cn(CONTROL_CLASS, "font-mono [color-scheme:dark]", hasMenu && "pr-[118px]", invalid && "border-rose-500")}
      />
      {hasMenu && <ExpressionMenu groups={groups} onPick={pick} label={`Add an expression to ${label}`} className="absolute right-1" />}
    </div>
  );
}

/** One row of the list: the text and the stable key React tracks it by. */
export interface DraftItem {
  key: string;
  text: string;
}

/** The value box, or one per row with add and remove for a list property. */
export function ItemsEditor({
  items,
  isArray,
  fieldType,
  enumValues,
  placeholder,
  invalid,
  groups,
  onChange,
  onUseNow,
  onAdd,
  onRemove,
}: Readonly<{
  items: DraftItem[];
  isArray: boolean;
  fieldType: string;
  enumValues: string[];
  placeholder: string;
  invalid: boolean;
  groups: ExpressionGroup[];
  onChange: (index: number, text: string) => void;
  onUseNow: () => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}>) {
  return (
    <>
      {items.map((item, index) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ValueBox
              fieldType={fieldType}
              enumValues={enumValues}
              value={item.text}
              label={isArray ? `Value ${index + 1}` : "Value"}
              placeholder={placeholder}
              invalid={invalid}
              groups={groups}
              onChange={(text) => onChange(index, text)}
              onUseNow={onUseNow}
            />
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

/**
 * What the Expression menu offers a property: this record's single values and the signed-in user's
 * for text, the current date & time for a single date-time, nothing for other types.
 */
export function expressionGroups({
  fieldType,
  isArray,
  schemaName,
  fields,
  authNames,
}: Readonly<{
  fieldType: string;
  isArray: boolean;
  schemaName: string;
  fields: Record<string, { isObject: boolean; isArray: boolean }>;
  authNames: readonly string[];
}>): ExpressionGroup[] {
  if (fieldType === "DateTime" && !isArray) {
    return [
      {
        heading: "Date & time",
        options: [{ value: CURRENT_DATE_TIME, label: "Current date & time", detail: "when the record is created" }],
      },
    ];
  }
  if (fieldType !== "String" && fieldType !== "ID") return [];
  const record = Object.entries(fields)
    .filter(([, field]) => !field.isObject && !field.isArray)
    .map(([path]) => ({ value: `{{${schemaName}.${path}}}`, label: path, detail: `${schemaName}.${path}` }));
  // Roles and Permissions are lists: only a list property can take them.
  const auth = authNames
    .filter((name) => isArray || (name !== "Roles" && name !== "Permissions"))
    .map((name) => ({ value: `{{Auth.${name}}}`, label: AUTH_LABELS[name] ?? name, detail: `Auth.${name}` }));
  return [
    { heading: "This record", options: record },
    { heading: "Signed-in user", options: auth },
  ];
}

const AUTH_LABELS: Record<string, string> = {
  UserId: "User ID",
  Email: "Email",
  OrganizationId: "Organization",
  Roles: "Roles",
  Permissions: "Permissions",
};

const OFFSET_PARTS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
] as const;

/**
 * The current date & time in place of a fixed date: what it is, a way back to a fixed date, and an
 * optional adjustment read back as a sentence ("30 days after the record is created").
 */
export function CurrentDateTimeCard({
  direction,
  offset,
  invalid,
  summary,
  onDirection,
  onChange,
  onUseFixed,
}: Readonly<{
  direction: OffsetDirection;
  offset: DefaultDraft["offset"];
  invalid: boolean;
  /** The adjustment as saved would read, or null while a part isn't a whole number. */
  summary: string | null;
  onDirection: (direction: OffsetDirection) => void;
  onChange: (offset: DefaultDraft["offset"]) => void;
  onUseFixed: () => void;
}>) {
  const adjustId = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex min-h-11 items-center gap-2.5 rounded-md border border-primary/40 bg-background py-1.5 pl-2.5 pr-1.5">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-foreground">Current date &amp; time</p>
          <p className="text-[11px] text-muted-foreground">Taken when each record is created</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 text-[11.5px]" onClick={onUseFixed}>
          Use a fixed date
        </Button>
      </div>

      <div role="group" aria-labelledby={adjustId} className="rounded-md border border-border/50 bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span id={adjustId} className={LABEL_CLASS}>
            Adjust (optional)
          </span>
          <div role="radiogroup" aria-label="Move the date" className="flex h-[26px] rounded-md border border-border/60 bg-card p-0.5">
            {(["+", "-"] as const).map((sign) => (
              <button
                key={sign}
                type="button"
                role="radio"
                aria-checked={direction === sign}
                onClick={() => onDirection(sign)}
                className={cn(
                  "rounded-[4px] px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
                  direction === sign ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sign === "+" ? "Later" : "Earlier"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {OFFSET_PARTS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[10.5px] text-muted-foreground">{label}</span>
              <Input
                type="text"
                inputMode="numeric"
                value={offset[key]}
                onChange={(e) => onChange({ ...offset, [key]: e.target.value })}
                className={cn(CONTROL_CLASS, "h-[34px] px-2 font-mono", invalid && "border-rose-500")}
              />
            </label>
          ))}
        </div>
        {summary && <p className="mt-2.5 text-xs text-foreground/85">{summary}</p>}
      </div>
    </div>
  );
}

/** The adjustment as a sentence, from the draft's direction and parts; null while a part isn't whole. */
export function describeDraftNow(direction: OffsetDirection, offset: DefaultDraft["offset"]): string | null {
  const sign = direction === "-" ? -1 : 1;
  const parts = Object.values(offset);
  if (parts.some((part) => !/^[+-]?\d+$/.test(part.trim()))) return null;
  const n = (s: string) => Number.parseInt(s.trim(), 10) * sign || 0;
  return describeNow({ days: n(offset.days), hours: n(offset.hours), minutes: n(offset.minutes), seconds: n(offset.seconds) });
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
              "whitespace-pre",
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
