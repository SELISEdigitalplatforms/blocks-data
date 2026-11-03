"use client";

import { Check, RectangleEllipsis } from "lucide-react";

import { DefaultValuePanel, type DefaultValuePanelProps } from "../default-value/default-value-panel";
import { FieldSubject, PanelHeader, PanelShell } from "../primitives";
import {
  SchemaFieldValidationPanel,
  type SchemaFieldValidationPanelProps,
} from "../schema-fields-validation/schema-field-validation-panel";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface InspectorHeading {
  /** The qualified property name being inspected. */
  subject: string;
  /** Second line when the schema isn't known, e.g. "Field on Order". */
  context?: string;
  /** The schema the property belongs to; shown as "on Order" after the type. */
  schemaName?: string;
}

/** Validations (the default) or the default value of one field: both live in the Rules column. */
export type ValidationInspectorTarget = InspectorHeading &
  (({ panel?: "validation" } & SchemaFieldValidationPanelProps) | ({ panel: "default" } & DefaultValuePanelProps));

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
 *
 * The same slot shows a field's default value (`panel: "default"`). Both
 * panels name themselves in the title and put the property on the second
 * line — name, type, schema — so the two are told apart at a glance.
 */
export function ValidationInspector({
  target,
  onClose,
}: {
  target: ValidationInspectorTarget;
  onClose: () => void;
}) {
  const { t } = useT("data.gateway.validation");
  if (target.panel === "default") {
    const { subject, context, schemaName, panel: _panel, ...panelProps } = target;
    return (
      <PanelShell label={t("VALIDATION_INSPECTOR.DEFAULT_VALUE_FOR_SUBJECT", { subject })}>
        <PanelHeader
          icon={RectangleEllipsis}
          title={t("VALIDATION_INSPECTOR.DEFAULT_VALUE")}
          mono={false}
          subtitle={
            <>
              <FieldSubject name={subject} type={panelProps.fieldType} isArray={panelProps.isArray} schemaName={schemaName} />
              {!schemaName && context && <span className="truncate">{context}</span>}
            </>
          }
          onClose={onClose}
          closeLabel={t("VALIDATION_INSPECTOR.CLOSE_DEFAULT_VALUE_INSPECTOR")}
        />
        <DefaultValuePanel {...panelProps} />
      </PanelShell>
    );
  }

  const { subject, context, schemaName, panel: _panel, ...panelProps } = target;

  return (
    <PanelShell label={t("VALIDATION_INSPECTOR.VALIDATIONS_FOR_SUBJECT", { subject })}>
      <PanelHeader
        icon={Check}
        title={t("VALIDATION_INSPECTOR.VALIDATIONS")}
        mono={false}
        subtitle={
          <>
            <FieldSubject name={subject} type={panelProps.fieldType} isArray={panelProps.isArray} schemaName={schemaName} />
            {!schemaName && context && <span className="truncate">{context}</span>}
          </>
        }
        onClose={onClose}
        closeLabel={t("VALIDATION_INSPECTOR.CLOSE_VALIDATION_INSPECTOR")}
      />
      <SchemaFieldValidationPanel {...panelProps} />
    </PanelShell>
  );
}
