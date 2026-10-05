"use client";

import { SCHEMA_NAME_ALLOWED_PATTERN } from "@/data-gateway/utils/input-restriction.util";
import { X } from "lucide-react";
import { useRef, useState } from "react";

interface EnumValuesEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  id?: string;
}

const MAX_VALUES = 100;
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
export function EnumValuesEditor({ values, onChange, disabled, id }: Readonly<EnumValuesEditorProps>) {
  const [draft, setDraft] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = values.length >= MAX_VALUES;
  const draftError = draft
    ? (atLimit ? `At most ${MAX_VALUES} values.` : validate(draft, values))
    : null;
  const editError =
    editIndex !== null && editText
      ? validate(editText, values.filter((_, i) => i !== editIndex))
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
    if (text && text !== values[editIndex] && !validate(text, values.filter((_, i) => i !== editIndex))) {
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

  return (
    <div id={id} className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Allowed values</span>
        <span>
          {values.length} / {MAX_VALUES}
        </span>
      </div>
      <div
        className={`flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm focus-within:ring-1 ${
          error
            ? "border-destructive focus-within:ring-destructive"
            : "border-input focus-within:ring-ring"
        } ${disabled ? "opacity-70" : "cursor-text"}`}
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
              className="h-6 w-24 rounded-full border border-input bg-background px-2 text-xs outline-none"
            />
          ) : (
            <span
              key={`${v}-${i}`}
              title={disabled ? undefined : "Double-click to edit"}
              onDoubleClick={() => {
                if (disabled) return;
                setEditIndex(i);
                setEditText(v);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <span>{v}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  className="rounded-full p-0.5 hover:bg-background"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ),
        )}
        {!disabled && (
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
            placeholder={values.length === 0 ? "Type a value and press Enter" : "Add…"}
            aria-label="New enum value"
            aria-invalid={!!error}
            className="h-6 min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        !disabled && (
          <p className="text-xs text-muted-foreground">
            {values.length === 0
              ? "Add at least one allowed value for Enum."
              : "Enter, comma or space to add · paste a list"}
          </p>
        )
      )}
    </div>
  );
}
