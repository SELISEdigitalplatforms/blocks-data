"use client";

import { Check } from "lucide-react";

import { PanelHeader, PanelShell } from "../primitives";
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
 *
 * Shares `PanelShell` with Access rather than restating its chrome, and takes
 * its width from the docked column, which holds at Access's idle 460px so the
 * column doesn't visibly resize depending on which of the two you opened.
 * Access still widens to 480px for its rule editor — Validation has no
 * equivalent sub-view that needs the extra room, so there's nothing on this
 * side to match that exception.
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
    <PanelShell label={`Validations for ${subject}`}>
      <PanelHeader
        icon={Check}
        title={subject}
        subtitle={context}
        onClose={onClose}
        closeLabel="Close validation inspector"
      />
      <SchemaFieldValidationPanel {...panelProps} />
    </PanelShell>
  );
}
