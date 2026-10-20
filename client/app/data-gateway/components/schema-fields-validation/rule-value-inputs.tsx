"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ValueChips } from "../default-value/default-value-fields";
import { ExpressionMenu, type ExpressionGroup } from "../primitives";
import {
  VALIDATION_TYPE,
  VALIDATION_TYPE_META,
  fittingVariables,
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
  menu,
  onChange,
}: Readonly<{
  kind: ValueKind;
  label: string;
  value: string;
  enumValues: string[];
  invalid: boolean;
  /** The "{ } Expression" button, placed inside the box (or after the chips). */
  menu?: ReactNode;
  onChange: (value: string) => void;
}>) {
  if (kind === "boolean" || kind === "enum") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <ValueChips options={kind === "boolean" ? ["true", "false"] : enumValues} value={value} label={label} onChange={onChange} />
        {menu}
      </div>
    );
  }
  const inputType = { number: "number", date: "datetime-local", text: "text" }[kind];
  return (
    <div className="relative flex items-center">
      <Input
        type={inputType}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(CONTROL_CLASS, "font-mono [color-scheme:dark]", menu ? "pr-[118px]" : "", invalid && "border-rose-500")}
      />
      {menu && <div className="absolute right-1 flex items-center">{menu}</div>}
    </div>
  );
}

/** A whole value that is one variable, e.g. "{{Employee.StartDate}}". */
const IS_ONE_VARIABLE = /^\s*\{\{[^{}]*\}\}\s*$/;

/** "{{Employee.StartDate}}" → "Employee.StartDate". */
const variableName = (variable: string) => variable.trim().slice(2, -2).trim();

/**
 * A compared value, in one box: entered by type, or another property of the same record picked from
 * the box's "{ } Expression" menu (e.g. {{Employee.StartDate}}). A comparison takes one whole
 * property, never text around it, so a picked property replaces the box with a chip and a way back
 * to a fixed value. Only properties of a fitting kind are offered; typed variables are checked too.
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
  /** Fitting {{Schema.X}} variables; the Expression menu shows only when there are some. */
  variableOptions: string[] | null;
  onChange: (value: string) => void;
}>) {
  const options = variableOptions ?? [];
  const groups: ExpressionGroup[] = [
    {
      heading: "This record",
      options: options.map((option) => {
        const name = variableName(option);
        return { value: option, label: name.split(".").slice(1).join(".") || name, detail: name };
      }),
    },
  ];
  const menu = options.length > 0 ? <ExpressionMenu groups={groups} onPick={(option) => onChange(option.value)} label={`Add an expression to ${label}`} /> : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className={LABEL_CLASS}>{heading}</span>
      {IS_ONE_VARIABLE.test(value) ? (
        <div
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-md border bg-background py-1 pl-2 pr-1",
            invalid ? "border-rose-500" : "border-primary/40",
          )}
        >
          <span aria-label={label} className="truncate rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[12px] text-primary">
            {variableName(value)}
          </span>
          <span className="flex-1 truncate text-[11px] text-muted-foreground">this record&apos;s value</span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-[11.5px]" onClick={() => onChange("")}>
            Use a fixed value
          </Button>
        </div>
      ) : (
        <ValueInput kind={kind} label={label} value={value} enumValues={enumValues} invalid={invalid} menu={menu} onChange={onChange} />
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
        // Side by side when both bounds are fixed; stacked when each box carries its own
        // Expression button, which needs the full width.
        return (
          <div className={cn("flex gap-2.5", variableOptions?.length && "flex-col gap-3.5")}>
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
