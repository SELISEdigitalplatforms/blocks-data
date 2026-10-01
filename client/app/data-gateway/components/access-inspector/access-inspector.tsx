"use client";

import { forwardRef } from "react";
import { Shield } from "lucide-react";

import { PanelHeader, PanelShell } from "../primitives";
import {
  AccessInspectorPanel,
  type AccessInspectorPanelHandle,
  type AccessInspectorPanelProps,
} from "./access-inspector-panel";

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
 * panel uses the rule editor's 760px width from the moment it opens, so async
 * rule loading and editor transitions never resize the surrounding layout.
 *
 * Both of those numbers live in the shell (`SHELL` in `utils/motion.ts`),
 * which sizes the column this fills and transitions it — see `PanelShell` for
 * why the panel does not declare a width of its own.
 */
export const AccessInspector = forwardRef<
  AccessInspectorPanelHandle,
  {
    target: AccessInspectorTarget;
    onRuleEditorOpenChange?: (open: boolean) => void;
    onClose: () => void;
  }
>(function AccessInspector({ target, onRuleEditorOpenChange, onClose }, ref) {
  const { subject, context, ...panelProps } = target;

  return (
    <PanelShell label={`Access for ${subject}`}>
      <PanelHeader
        icon={Shield}
        title={subject}
        subtitle={context}
        onClose={onClose}
        closeLabel="Close access inspector"
      />
      <AccessInspectorPanel
        ref={ref}
        {...panelProps}
        onRuleEditorOpenChange={onRuleEditorOpenChange}
      />
    </PanelShell>
  );
});
