"use client";

import { cn } from "@/lib/utils";
import { Shield, X } from "lucide-react";

import { AccessInspectorPanel, type AccessInspectorPanelProps } from "./access-inspector-panel";

export interface AccessInspectorTarget
  extends Omit<AccessInspectorPanelProps, "onRuleEditorOpenChange"> {
  /** Heading: the schema name, or the field being inspected. */
  subject: string;
  /** Second line, e.g. "Field on Order". */
  context?: string;
}

/**
 * Access, docked beside the table instead of covering it.
 *
 * It was an 85vw drawer: opening it hid the field list you were reasoning
 * about, and nothing on screen reminded you which field you had clicked. The
 * panel is 328px for reading and 480px once the rule editor opens, which is the
 * only part that needs the width.
 */
export function AccessInspector({
  target,
  expanded,
  onRuleEditorOpenChange,
  onClose,
}: {
  target: AccessInspectorTarget;
  expanded: boolean;
  onRuleEditorOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const { subject, context, ...panelProps } = target;

  return (
    <aside
      aria-label={`Access for ${subject}`}
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-hidden rounded-sm border border-border/40 bg-card transition-[width] duration-200",
        expanded ? "lg:w-[480px]" : "lg:w-[328px]",
      )}
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-border/40 px-3 py-2.5">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium text-foreground" title={subject}>
            {subject}
          </p>
          {context && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{context}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close access inspector"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <AccessInspectorPanel {...panelProps} onRuleEditorOpenChange={onRuleEditorOpenChange} />
    </aside>
  );
}
