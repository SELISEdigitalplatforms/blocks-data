"use client";

import { Input } from "@/components/ui-kits/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import { cn } from "@/lib/utils";
import { useId, useState, type ReactNode } from "react";
import { ValueChips } from "../default-value/default-value-fields";
import {
  VALIDATION_TYPE,
  VALIDATION_TYPE_META,
  fittingVariables,
  looksLikeVariable,
  valueKindForField,
  type RuleDraft,
  type RuleVariableContext,
  type ValueKind,
} from "../../utils/validation-rules.util";
import { ReferenceTargetPicker } from "./reference-target-picker";

const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground";
const CONTROL_CLASS = "h-9 rounded-md border-border/60 bg-background text-[12.5px]";

function Labelled({ label, action, children }: Readonly<{ label: string; action?: ReactNode; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** One compared value, entered the way the property's type is: number, date-time, true/false, enum value or text. */
function ValueInput({
  kind,
  label,
  value,
  enumValues,
  invalid,
  onChange,
}: Readonly<{ kind: ValueKind; label: string; value: string; enumValues: string[]; invalid: boolean; onChange: (value: string) => void }>) {
  if (kind === "boolean" || kind === "enum") {
    return <ValueChips options={kind === "boolean" ? ["true", "false"] : enumValues} value={value} label={label} onChange={onChange} />;
  }
  const inputType = { number: "number", date: "datetime-local", text: "text" }[kind];
  return (
    <Input
      type={inputType}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
    />
  );
}

/**
 * A compared value: fixed (entered by type) or one variable naming another property of the same record,
 * e.g. {{Employee.StartDate}}. Only properties of a fitting kind are offered; typing is checked too.
 */
function ComparisonValue({
  kind,
  heading,
  label,
  value,
  enumValues,
  invalid,
  variableOptions,
  onChange,
}: Readonly<{
  kind: ValueKind;
  /** The visible label over the input, e.g. "Compared with" or "From". */
  heading: string;
  /** The accessible name of the input, e.g. "Value" or "Min". */
  label: string;
  value: string;
  enumValues: string[];
  invalid: boolean;
  /** Fitting {{Schema.X}} variables; the switch shows only when a context is given. */
  variableOptions: string[] | null;
  onChange: (value: string) => void;
}>) {
  const [isVariable, setIsVariable] = useState(() => looksLikeVariable(value));
  const groupName = useId();
  const switchTo = (variable: boolean) => {
    if (variable === isVariable) return;
    setIsVariable(variable);
    onChange("");
  };

  // The Fixed value / Another property switch sits on the label's row, right-aligned, as drawn.
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className={LABEL_CLASS}>{heading}</span>
        {variableOptions && (
        <fieldset className="flex h-6 shrink-0 rounded-md border border-border/60 bg-background p-0.5">
          <legend className="sr-only">{`${label} source`}</legend>
          {([false, true] as const).map((variable) => (
            <label
              key={String(variable)}
              className={cn(
                "flex cursor-pointer items-center rounded-[4px] px-2 text-[10.5px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
                isVariable === variable ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="radio" name={groupName} className="sr-only" checked={isVariable === variable} onChange={() => switchTo(variable)} />
              {variable ? "Another property" : "Fixed value"}
            </label>
          ))}
        </fieldset>
        )}
      </div>
      {isVariable && variableOptions ? (
        <>
          <Input
            aria-label={label}
            placeholder={variableOptions[0] ?? "{{Schema.Property}}"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
          />
          {variableOptions.length > 0 && (
            <Select value="" onValueChange={onChange}>
              <SelectTrigger className="h-8 w-full rounded-md border-border/60 bg-background text-xs" aria-label={`Pick a property for ${label}`}>
                <SelectValue placeholder="Pick a property of this record…" />
              </SelectTrigger>
              <SelectContent>
                {variableOptions.map((option) => (
                  <SelectItem key={option} value={option} className="font-mono text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      ) : (
        <ValueInput kind={kind} label={label} value={value} enumValues={enumValues} invalid={invalid} onChange={onChange} />
      )}
    </div>
  );
}

/**
 * The inputs a rule type needs, e.g. nothing for Not empty, one number for Min length, two for
 * a range, the pattern for Regex, and the target schema and field for Reference.
 */
export function RuleValueInputs({
  draft,
  fieldType,
  enumValues,
  projectKey,
  variables,
  fieldName,
  error,
  patternAction,
  onChange,
}: Readonly<{
  draft: RuleDraft;
  fieldType: string;
  enumValues: string[];
  projectKey: string;
  /** The schema comparison values may refer to; without it, values are fixed only. */
  variables?: RuleVariableContext;
  /** The property being checked, left out of the variables offered. */
  fieldName?: string;
  /** Why the rule cannot be saved yet, once worth showing. */
  error: string | null;
  /** Shown beside the Pattern label, e.g. the "Generate from a description" toggle. */
  patternAction?: ReactNode;
  onChange: (patch: Partial<RuleDraft>) => void;
}>) {
  const input = VALIDATION_TYPE_META[draft.type]?.input;
  const kind = valueKindForField(fieldType);
  const invalid = Boolean(error);
  const variableOptions = variables?.schemaName ? fittingVariables(fieldType, variables, fieldName) : null;

  const body = (() => {
    switch (input) {
      case "none":
        return <p className="text-[11px] leading-relaxed text-muted-foreground">Fails when the value is missing or blank (an empty list, for a list).</p>;
      case "regex":
        return (
          <Labelled label="Pattern" action={patternAction}>
            <Textarea
              placeholder="e.g. ^[a-zA-Z]+$"
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn("resize-none rounded-md border-border/60 bg-background font-mono text-[12.5px]", invalid && "border-rose-500")}
              rows={3}
            />
          </Labelled>
        );
      case "length":
        return (
          <Labelled label="Characters">
            <Input
              type="number"
              min={0}
              aria-label="Length"
              placeholder={draft.type === VALIDATION_TYPE.MinLength ? "at least" : "at most"}
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
            />
          </Labelled>
        );
      case "lengthRange":
        return (
          <div className="flex gap-2.5">
            <Labelled label="Min characters">
              <Input type="number" min={0} aria-label="Min length" value={draft.value} onChange={(e) => onChange({ value: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} />
            </Labelled>
            <Labelled label="Max characters">
              <Input type="number" min={0} aria-label="Max length" value={draft.secondaryValue} onChange={(e) => onChange({ secondaryValue: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} />
            </Labelled>
          </div>
        );
      case "value":
        return (
          <ComparisonValue
            kind={kind}
            heading={draft.type === VALIDATION_TYPE.Equal || draft.type === VALIDATION_TYPE.NotEqual ? "Value" : "Compared with"}
            label="Value"
            value={draft.value}
            enumValues={enumValues}
            invalid={invalid}
            variableOptions={variableOptions}
            onChange={(value) => onChange({ value })}
          />
        );
      case "valueRange":
        // Side by side when both bounds are fixed; stacked when each carries its own
        // Fixed value / Another property switch, which needs the full width beside its label.
        return (
          <div className={cn("flex gap-2.5", variableOptions && "flex-col gap-3.5")}>
            <ComparisonValue kind={kind} heading="From" label="Min" value={draft.value} enumValues={enumValues} invalid={invalid} variableOptions={variableOptions} onChange={(value) => onChange({ value })} />
            <ComparisonValue kind={kind} heading="To" label="Max" value={draft.secondaryValue} enumValues={enumValues} invalid={invalid} variableOptions={variableOptions} onChange={(secondaryValue) => onChange({ secondaryValue })} />
          </div>
        );
      case "reference":
        return (
          <>
            <ReferenceTargetPicker
              projectKey={projectKey}
              sourceType={fieldType}
              schemaName={draft.value}
              fieldName={draft.secondaryValue}
              onChange={({ schemaName, fieldName }) => onChange({ value: schemaName, secondaryValue: fieldName })}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Inserts and updates are refused when the value (each item, for a list) is not found there. Empty values are not checked.
            </p>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col gap-1.5">
      {body}
      {error && (
        <p role="alert" className="text-[11.5px] text-rose-500">
          {error}
        </p>
      )}
    </div>
  );
}
