"use client";

import { SCHEMA_NAME_ALLOWED_PATTERN } from "@/data-gateway/utils/input-restriction.util";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EnumValuesEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  id?: string;
  /** Focus the value field and scroll it into view on mount (the type was just switched to Enum). */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

const MAX_VALUES = 100;

/** One value chip: a small bordered tag, matching the table's other badges. */
const CHIP_CLASS =
  "inline-flex h-6 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground";
const SEPARATORS = /[\s,]+/;

/** Returns an error message for `value`, or null when it can be added next to `others`. */
function validate(value: string, others: string[]): string | null {
  if (value.length > 100) return "Value must be 1–100 characters.";
  if (!SCHEMA_NAME_ALLOWED_PATTERN.test(value)) {
    return "Only letters, numbers, and '_'; cannot start with a number.";
  }
  if (others.includes(value)) return "Already added.";
  return null;
}

/**
 * Allowed-values tag input for Enum property type (SPEC #353 H5).
 * Chips and the text field share one box. Enter, comma, space, Tab or blur commits a value;
 * pasted lists are split on commas/whitespace. Entries must match GraphQL name rules:
 * ^[A-Za-z_][A-Za-z0-9_]*$
 */
export function EnumValuesEditor({
  values,
  onChange,
  disabled,
  id,
  autoFocus,
  onAutoFocused,
}: Readonly<EnumValuesEditorProps>) {
  const [draft, setDraft] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The editor grows the row, pushing it below the fold; bring it back and focus the field.
  useEffect(() => {
    if (!autoFocus || disabled) return;
    inputRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    onAutoFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atLimit = values.length >= MAX_VALUES;
  const draftError = draft
    ? atLimit
      ? `At most ${MAX_VALUES} values.`
      : validate(draft, values)
    : null;
  const editError =
    editIndex !== null && editText
      ? validate(
          editText,
          values.filter((_, i) => i !== editIndex),
        )
      : null;
  const error = editError ?? draftError;

  /** Adds every valid token; the first rejected token stays in the field so it can be fixed. */
  const commitTokens = (tokens: string[]) => {
    const next = [...values];
    let rejected: string | null = null;
    for (const token of tokens) {
      if (!token) continue;
      if (next.length >= MAX_VALUES || validate(token, next)) {
        rejected ??= token;
        continue;
      }
      next.push(token);
    }
    if (next.length !== values.length) onChange(next);
    setDraft(rejected ?? "");
  };

  const commitEdit = () => {
    if (editIndex === null) return;
    const text = editText.trim();
    if (
      text &&
      text !== values[editIndex] &&
      !validate(
        text,
        values.filter((_, i) => i !== editIndex),
      )
    ) {
      onChange(values.map((v, i) => (i === editIndex ? text : v)));
    }
    setEditIndex(null);
  };

  const removeAt = (index: number) => onChange(values.filter((_, i) => i !== index));

  const handleDraftChange = (text: string) => {
    if (!SEPARATORS.test(text)) {
      setDraft(text);
      return;
    }
    // A separator was typed or pasted: everything before it is complete, the tail stays editable.
    const parts = text.split(SEPARATORS);
    const tail = parts.pop() ?? "";
    commitTokens(parts);
    setDraft((rejected) => rejected || tail);
  };

  // Viewing: a plain list of the values, not a greyed-out input. An empty box with a
  // "0 / 100" counter looked like a broken field when there was nothing to edit.
  if (disabled) {
    return (
      <div id={id} className="mt-2 space-y-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Allowed values</span>
        {values.length === 0 ? (
          <p className="text-xs text-muted-foreground">No allowed values defined.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {values.map((v, i) => (
              <span key={`${v}-${i}`} className={CHIP_CLASS}>
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} id={id} className="mt-2 space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Allowed values</span>
      <div
        // Same quiet field look as the name / type / description inputs beside it.
        className={`flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1 text-[13px] transition-colors focus-within:ring-1 ${
          error
            ? "border-destructive focus-within:ring-destructive"
            : "border-border/70 hover:border-border focus-within:border-primary/50 focus-within:ring-primary/30"
        }`}
        onClick={(e) => {
          if (editIndex === null && e.target === e.currentTarget) inputRef.current?.focus();
        }}
      >
        {values.map((v, i) =>
          editIndex === i ? (
            <input
              key={`edit-${i}`}
              autoFocus
              aria-label={`Edit ${v}`}
              value={editText}
              onChange={(e) => setEditText(e.target.value.replace(SEPARATORS, ""))}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditIndex(null);
                }
              }}
              className="h-6 w-24 rounded-md border border-input bg-background px-2 text-xs outline-none"
            />
          ) : (
            <span
              key={`${v}-${i}`}
              title="Double-click to edit"
              onDoubleClick={() => {
                setEditIndex(i);
                setEditText(v);
              }}
              className={CHIP_CLASS}
            >
              <span>{v}</span>
              <button
                type="button"
                aria-label={`Remove ${v}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ),
        )}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              e.preventDefault();
              commitTokens([draft.trim()]);
            } else if (e.key === "Tab" && draft) {
              e.preventDefault();
              commitTokens([draft.trim()]);
            } else if (e.key === "Backspace" && !draft && values.length > 0) {
              e.preventDefault();
              setDraft(values[values.length - 1]);
              onChange(values.slice(0, -1));
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            commitTokens(e.clipboardData.getData("text").split(SEPARATORS));
          }}
          onBlur={() => draft && commitTokens([draft.trim()])}
          placeholder={values.length === 0 ? "Add a value…" : "Add…"}
          aria-label="New enum value"
          aria-invalid={!!error}
          className="h-6 min-w-16 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div className="flex items-start justify-between gap-2 text-[11px] leading-snug">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : values.length === 0 ? (
          <p className="text-muted-foreground">Add at least one allowed value for Enum.</p>
        ) : (
          <span />
        )}
        {values.length > 0 && (
          <span
            title="Enter, comma or space adds a value; you can also paste a list"
            className="shrink-0 tabular-nums text-muted-foreground/70"
          >
            {values.length} / {MAX_VALUES}
          </span>
        )}
      </div>
    </div>
  );
}
