"use client";

import { Check, X } from "lucide-react";

import {
  SchemaFieldValidationPanel,
  type SchemaFieldValidationPanelProps,
} from "../schema-fields-validation/schema-field-validation-panel";

export interface ValidationInspectorTarget extends SchemaFieldValidationPanelProps {
  /** Heading: the qualified field name being inspected. */
  subject: string;
  /** Second line, e.g. "Field on Order". */
  context?: string;
}

/**
 * Validations, docked beside the table instead of covering it — the same
 * treatment `AccessInspector` gives access, so opening either one from the
 * Rules column doesn't hide the field list you were reasoning about.
 */
export function ValidationInspector({
  target,
  onClose,
}: {
  target: ValidationInspectorTarget;
  onClose: () => void;
}) {
  const { subject, context, ...panelProps } = target;

  return (
    <aside
      aria-label={`Validations for ${subject}`}
      className="flex min-h-0 w-[480px] shrink-0 flex-col overflow-hidden rounded-sm border border-border/40 bg-card"
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-border/40 px-3 py-2.5">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium text-foreground" title={subject}>
            {subject}
          </p>
          {context && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{context}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close validation inspector"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <SchemaFieldValidationPanel {...panelProps} />
    </aside>
  );
}
