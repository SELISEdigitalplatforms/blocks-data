"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { SCHEMA_NAME_ALLOWED_PATTERN } from "@/data-gateway/utils/input-restriction.util";
import { Plus, X } from "lucide-react";
import { useState } from "react";

interface EnumValuesEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Allowed-values list for Enum property type (SPEC #353 H5).
 * Entries must match GraphQL name rules: ^[A-Za-z_][A-Za-z0-9_]*$
 */
export function EnumValuesEditor({ values, onChange, disabled, id }: Readonly<EnumValuesEditorProps>) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addValue = () => {
    const next = draft.trim();
    if (!next) {
      setError("Enter at least one character.");
      return;
    }
    if (next.length > 100) {
      setError("Value must be 1–100 characters.");
      return;
    }
    if (!SCHEMA_NAME_ALLOWED_PATTERN.test(next)) {
      setError("Only letters, numbers, and '_'; cannot start with a number.");
      return;
    }
    if (values.includes(next)) {
      setError("Values must be unique.");
      return;
    }
    if (values.length >= 100) {
      setError("At most 100 values.");
      return;
    }
    onChange([...values, next]);
    setDraft("");
    setError(null);
  };

  const removeAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div id={id} className="mt-2 space-y-2 rounded-md border border-dashed border-muted-foreground/30 p-2">
      <div className="text-xs font-medium text-muted-foreground">Allowed values</div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <li
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <span>{v}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  className="rounded-full p-0.5 hover:bg-background"
                  onClick={() => removeAt(i)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addValue();
              }
            }}
            placeholder="Add value (e.g. Active)"
            className="h-8 text-sm"
            aria-label="New enum value"
          />
          <Button type="button" size="sm" variant="outline" onClick={addValue} aria-label="Add enum value">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!disabled && values.length === 0 && (
        <p className="text-xs text-muted-foreground">Add at least one allowed value for Enum.</p>
      )}
    </div>
  );
}
