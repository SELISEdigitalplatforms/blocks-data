"use client";

import { Shield } from "lucide-react";

import { PanelHeader, PanelShell } from "../primitives";
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
 * panel is 460px for reading and 480px once the rule editor opens, which is the
 * only part that needs the extra width.
 *
 * Both of those numbers live in the shell (`SHELL` in `utils/motion.ts`),
 * which sizes the column this fills and transitions it — see `PanelShell` for
 * why the panel does not declare a width of its own.
 */
export function AccessInspector({
  target,
  onRuleEditorOpenChange,
  onClose,
}: {
  target: AccessInspectorTarget;
  onRuleEditorOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
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
      <AccessInspectorPanel {...panelProps} onRuleEditorOpenChange={onRuleEditorOpenChange} />
    </PanelShell>
  );
}
