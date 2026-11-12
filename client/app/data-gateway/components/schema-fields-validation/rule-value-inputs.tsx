"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Switch } from "@/components/ui-kits/switch/switch";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import { cn } from "@/lib/utils";
import { Clock, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ValueChips } from "../default-value/default-value-fields";
import { ExpressionMenu, type ExpressionGroup } from "../primitives";
import { RELATIVE_NOW_UNITS, isRelativeNowWritten, parseRelativeNow, relativeNowFrom, relativeNowText, type RelativeNowUnit } from "../../utils/relative-now";
import { MAX_LIST_VALUES } from "../../utils/rule-messages";
import { newConditionRow, type ConditionDraft, type ConditionField } from "../../utils/validation-conditions";
import {
  VALIDATION_TYPE,
  VALIDATION_TYPE_META,
  fittingVariables,
  valueKindForField,
  type RuleDraft,
  type RuleVariableContext,
  type ValueKind,
} from "../../utils/validation-rules.util";
import { ConditionEditor, ConditionTag } from "./condition-editor";
import { ReferenceTargetPicker, useReferenceTarget } from "./reference-target-picker";
import { useT } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_VALIDATION_MODULE = "data.gateway.validation";

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

const T = VALIDATION_TYPE;
const ORDERING_TYPES: number[] = [T.GreaterThan, T.LessThan, T.GreaterThanOrEqual, T.LessThanOrEqual, T.Range];

/** How the bound of a rule type reads with a date, e.g. "on or before". */
const BOUND_SENTENCE_KEY: Record<number, string> = {
  [T.GreaterThan]: "RULE_VALUE_INPUTS.FIELD_MUST_BE_AFTER",
  [T.LessThan]: "RULE_VALUE_INPUTS.FIELD_MUST_BE_BEFORE",
  [T.GreaterThanOrEqual]: "RULE_VALUE_INPUTS.FIELD_MUST_BE_ON_OR_AFTER",
  [T.LessThanOrEqual]: "RULE_VALUE_INPUTS.FIELD_MUST_BE_ON_OR_BEFORE",
};

/** A moment in UTC as it reads: "25 Oct 2008", with the time when it matters (now, hours, minutes). */
function shownMoment(date: Date, withTime: boolean): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return withTime ? `${day} ${date.toISOString().slice(11, 16)} UTC` : day;
}

/**
 * A date relative to now, entered as Now [+/−] [amount] [unit], with a line showing what it means today (D9).
 * `sentence` puts today's bound in words, e.g. "BirthDate must be on or before 25 Oct 2008".
 */
function RelativeNowEditor({
  label,
  value,
  invalid,
  sentence,
  onChange,
}: Readonly<{ label: string; value: string; invalid: boolean; sentence: (bound: string) => string; onChange: (value: string) => void }>) {
  const { t } = useT(DATA_GATEWAY_VALIDATION_MODULE);
  const parsed = parseRelativeNow(value);
  // Kept here as the sign is: "{{Now}}" (an amount of 0) carries neither.
  const [sign, setSign] = useState<1 | -1>(parsed && parsed.amount > 0 ? 1 : -1);
  const [unit, setUnit] = useState<RelativeNowUnit>(parsed?.unit || "y");
  const amount = parsed ? Math.abs(parsed.amount) : 0;
  const write = (next: { sign?: 1 | -1; amount?: number; unit?: RelativeNowUnit }) => {
    const s = next.sign ?? sign;
    const a = next.amount ?? amount;
    onChange(relativeNowText({ amount: s * a, unit: a > 0 ? (next.unit ?? unit) : "" }));
  };
  const bound = parsed ? relativeNowFrom(parsed, new Date()) : null;
  const withTime = !parsed?.unit || parsed.unit === "h" || parsed.unit === "min";

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border bg-background p-2", invalid ? "border-rose-500" : "border-primary/40")}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[12px] text-primary">
          <Clock className="h-3 w-3" aria-hidden />
          {t("RULE_VALUE_INPUTS.NOW")}
        </span>
        <fieldset aria-label={t("RULE_VALUE_INPUTS.LABEL_BEFORE_OR_AFTER_NOW", { label })} className="m-0 min-w-0 flex gap-0.5 rounded-md border border-border/50 p-0.5">
          {([1, -1] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sign === option}
              aria-label={option === 1 ? t("RULE_VALUE_INPUTS.PLUS") : t("RULE_VALUE_INPUTS.MINUS")}
              onClick={() => {
                setSign(option);
                write({ sign: option });
              }}
              className={cn("h-6 w-6 rounded font-mono text-[13px]", sign === option ? "bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              {option === 1 ? "+" : "−"}
            </button>
          ))}
        </fieldset>
        <Input
          type="number"
          min={0}
          max={9999}
          aria-label={t("RULE_VALUE_INPUTS.LABEL_AMOUNT", { label })}
          value={parsed ? String(amount) : ""}
          onChange={(e) => write({ amount: Math.min(9999, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })}
          className={cn(CONTROL_CLASS, "w-[76px] font-mono")}
        />
        <Select
          value={unit}
          onValueChange={(next) => {
            setUnit(next as RelativeNowUnit);
            write({ unit: next as RelativeNowUnit });
          }}
        >
          <SelectTrigger className={cn(CONTROL_CLASS, "w-[110px]")} aria-label={t("RULE_VALUE_INPUTS.LABEL_UNIT", { label })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATIVE_NOW_UNITS.map((u) => (
              <SelectItem key={u.unit} value={u.unit}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-7 shrink-0 text-[11.5px]" onClick={() => onChange("")}>
          {t("RULE_VALUE_INPUTS.USE_A_FIXED_VALUE")}
        </Button>
      </div>
      {bound && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("RULE_VALUE_INPUTS.SAVED_TODAY_BOUND_MOVES", { sentence: sentence(shownMoment(bound, withTime)) })}
        </p>
      )}
    </div>
  );
}

/**
 * Is one of / is not one of: an Enum's values as toggles, anything else as chips added by typing (Enter or a comma)
 * or by pasting a comma-separated list.
 */
/** Key from the value and its n-th repeat, so a removed chip never renames the others. */
function chipKey(values: string[], index: number): string {
  const repeat = values.slice(0, index).filter((item) => item === values[index]).length;
  return `${values[index]}#${repeat}`;
}

function ValueListInput({
  values,
  enumValues,
  kind,
  invalid,
  fieldLabel,
  onChange,
}: Readonly<{ values: string[]; enumValues: string[]; kind: ValueKind; invalid: boolean; fieldLabel: string; onChange: (values: string[]) => void }>) {
  const { t } = useT(DATA_GATEWAY_VALIDATION_MODULE);
  const [typed, setTyped] = useState("");
  if (kind === "enum" && enumValues.length > 0) {
    // A value the Enum no longer has stays visible, so it can be taken out.
    const stale = values.filter((value) => !enumValues.includes(value));
    return (
      <div className="flex flex-col gap-1.5">
        <fieldset aria-label={t("RULE_VALUE_INPUTS.ALLOWED_VALUES")} className="m-0 min-w-0 flex flex-wrap gap-1.5">
          {[...enumValues, ...stale].map((option) => {
            const on = values.includes(option);
            const gone = stale.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? values.filter((v) => v !== option) : [...values, option])}
                className={cn(
                  "h-7 rounded-md border px-2 text-[12px]",
                  on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-background text-foreground/80 hover:border-primary/30",
                  gone && "border-rose-500/60 text-rose-400 line-through",
                )}
              >
                {option}
              </button>
            );
          })}
        </fieldset>
        <p className="text-[11px] text-muted-foreground">{t("RULE_VALUE_INPUTS.THE_ENUM_S_OWN_VALUES_PICKED")}</p>
        {stale.length > 0 && (
          <p className="text-[11px] text-rose-400">
            {t("RULE_VALUE_INPUTS.STALE_VALUES_NO_LONGER_ALLOWED", { values: stale.join(", "), field: fieldLabel, count: stale.length })}
          </p>
        )}
      </div>
    );
  }

  const add = (text: string) => {
    const items = text.split(",").map((item) => item.trim()).filter(Boolean);
    if (items.length > 0) onChange([...values, ...items]);
    setTyped("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-background p-1", invalid ? "border-rose-500" : "border-border/60")}>
        {values.map((value, index) => (
          <span key={chipKey(values, index)} className="inline-flex items-center gap-1 rounded bg-primary/10 py-0.5 pl-1.5 pr-0.5 font-mono text-[12px] text-primary">
            {value}
            <button type="button" aria-label={t("RULE_VALUE_INPUTS.REMOVE_VALUE", { value })} className="rounded p-0.5 hover:bg-primary/20" onClick={() => onChange(values.filter((_, i) => i !== index))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          aria-label={t("RULE_VALUE_INPUTS.ADD_A_VALUE")}
          inputMode={kind === "number" ? "decimal" : undefined}
          value={typed}
          placeholder={values.length === 0 ? t("RULE_VALUE_INPUTS.TYPE_A_VALUE_THEN_ENTER") : ""}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setTyped(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(typed);
            } else if (e.key === "Backspace" && !typed && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => add(typed)}
          className="min-w-[120px] flex-1 bg-transparent px-1 font-mono text-[12.5px] outline-hidden"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("RULE_VALUE_INPUTS.LIST_COUNT", { count: values.length, max: MAX_LIST_VALUES })}{kind === "text" ? ` ${t("RULE_VALUE_INPUTS.EXACT_MATCH_APPROVED_IS_NOT_APPROVED")}` : ""} {t("RULE_VALUE_INPUTS.PASTE_A_COMMA_SEPARATED_LIST_TO")}
      </p>
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
  nowSentence,
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
  /** Offer a date relative to now (DateTime properties, ordering rules): the bound in words for today. */
  nowSentence?: (bound: string) => string;
  onChange: (value: string) => void;
}>) {
  const { t } = useT(DATA_GATEWAY_VALIDATION_MODULE);
  const options = variableOptions ?? [];
  const groups: ExpressionGroup[] = [
    {
      heading: t("RULE_VALUE_INPUTS.THIS_RECORD"),
      options: options.map((option) => {
        const name = variableName(option);
        return { value: option, label: name.split(".").slice(1).join(".") || name, detail: name };
      }),
    },
  ];
  if (nowSentence) groups.push({ heading: t("RULE_VALUE_INPUTS.RELATIVE_TO_NOW"), options: [{ value: "{{Now}}", label: t("RULE_VALUE_INPUTS.NOW"), detail: t("RULE_VALUE_INPUTS.NOW_OR_AN_AMOUNT_BEFORE_OR") }] });
  const hasOptions = options.length > 0 || !!nowSentence;
  const menu = hasOptions ? <ExpressionMenu groups={groups.filter((g) => g.options.length > 0)} onPick={(option) => onChange(option.value)} label={t("RULE_VALUE_INPUTS.ADD_AN_EXPRESSION_TO_LABEL", { label })} /> : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className={LABEL_CLASS}>{heading}</span>
      {nowSentence && isRelativeNowWritten(value) && (
        <RelativeNowEditor label={label} value={value} invalid={invalid} sentence={nowSentence} onChange={onChange} />
      )}
      {!(nowSentence && isRelativeNowWritten(value)) && IS_ONE_VARIABLE.test(value) && (
        <div
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-md border bg-background py-1 pl-2 pr-1",
            invalid ? "border-rose-500" : "border-primary/40",
          )}
        >
          <span aria-label={label} className="truncate rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[12px] text-primary">
            {variableName(value)}
          </span>
          <span className="flex-1 truncate text-[11px] text-muted-foreground">{t("RULE_VALUE_INPUTS.THIS_RECORD_S_VALUE")}</span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-[11.5px]" onClick={() => onChange("")}>
            {t("RULE_VALUE_INPUTS.USE_A_FIXED_VALUE")}
          </Button>
        </div>
      )}
      {!(nowSentence && isRelativeNowWritten(value)) && !(IS_ONE_VARIABLE.test(value)) && (
        <ValueInput kind={kind} label={label} value={value} enumValues={enumValues} invalid={invalid} menu={menu} onChange={onChange} />
      )}
    </div>
  );
}

/**
 * The inputs a rule type needs, e.g. nothing for Not empty, one number for Min length, two for
 * a range, the pattern for Regex, and the target schema and field for Reference.
 */
/** Types a filter can compare with a fixed value; objects such as the access lists (Read, Update…) are left out. */
const FILTERABLE_TYPES = ["String", "ID", "Int", "Float", "DateTime", "Boolean", "Enum"];

/** The target's single-value properties a filter can name, with an Enum's values so they are offered as toggles. */
export function filterFieldsOf(target: { fields: { name: string; type: string; isArray: boolean; enumValues?: string[] }[] } | undefined): ConditionField[] {
  return (target?.fields ?? [])
    .filter((f) => !f.isArray && FILTERABLE_TYPES.includes(f.type))
    .map((f) => ({ path: f.name, type: f.type, isArray: false, ...(f.enumValues?.length ? { enumValues: f.enumValues } : {}) }));
}

/**
 * Where a Reference or Must not exist in rule looks, and which target records count: the target, the older-rule note
 * with "Use the new behaviour" (D2), and the optional filter on the target (WHERE, D1).
 */
function ReferenceInputs({
  draft,
  fieldType,
  projectKey,
  ownSchemaName,
  ownFieldName,
  olderReference,
  showConditionErrors,
  onChange,
}: Readonly<{
  draft: RuleDraft;
  fieldType: string;
  projectKey: string;
  ownSchemaName?: string;
  ownFieldName: string;
  olderReference?: boolean;
  showConditionErrors?: boolean;
  onChange: (patch: Partial<RuleDraft>) => void;
}>) {
  const { t } = useT(DATA_GATEWAY_VALIDATION_MODULE);
  const mustNotExist = draft.type === VALIDATION_TYPE.NotExistsIn;
  const target = useReferenceTarget(draft.value);
  const targetName = draft.value || "target";
  // NotExistsIn always skips deleted records; Reference from version 2 (decision 2).
  const skipsDeleted = mustNotExist || draft.useNewBehaviour || draft.evaluationVersion === undefined || draft.evaluationVersion >= 2;
  const filter: ConditionDraft = draft.targetFilter ?? { combine: "AND", rows: [], locked: null };
  const showOlderNote = olderReference && !draft.useNewBehaviour && !mustNotExist;

  return (
    <div className="flex flex-col gap-3">
      {showOlderNote && (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <p className="text-[11.5px] leading-relaxed text-foreground/85">
            {t("RULE_VALUE_INPUTS.THIS_RULE_WAS_SAVED_BEFORE_DELETED", { targetName })}
          </p>
          <Button type="button" size="sm" variant="outline" className="h-7 w-fit text-[11.5px]" onClick={() => onChange({ useNewBehaviour: true })}>
            {t("RULE_VALUE_INPUTS.USE_THE_NEW_BEHAVIOUR")}
          </Button>
        </div>
      )}
      {olderReference && draft.useNewBehaviour && !mustNotExist && (
        <p className="text-[11px] text-muted-foreground">{t("RULE_VALUE_INPUTS.DELETED_TARGETNAME_RECORDS_STOP", { targetName })}</p>
      )}

      <ReferenceTargetPicker
        projectKey={projectKey}
        sourceType={fieldType}
        schemaName={draft.value}
        fieldName={draft.secondaryValue}
        mustNotExist={mustNotExist}
        ownSchemaName={ownSchemaName}
        onChange={({ schemaName, fieldName }) =>
          // A filter names the target's properties, so it starts over with another target.
          onChange(schemaName === draft.value ? { secondaryValue: fieldName } : { value: schemaName, secondaryValue: fieldName, targetFilter: null, filterOn: false })
        }
      />

      {draft.value && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Switch
              id="rule-filter"
              size="sm"
              checked={!!draft.filterOn}
              onCheckedChange={(checked) =>
                onChange({
                  filterOn: checked === true,
                  // Switched on, it starts with one row on the target's first property, as "Only when" does.
                  targetFilter:
                    checked === true && (!draft.targetFilter || (!draft.targetFilter.locked && draft.targetFilter.rows.length === 0))
                      ? { combine: "AND", rows: [newConditionRow(filterFieldsOf(target))], locked: null }
                      : draft.targetFilter,
                })
              }
              aria-label={t("RULE_VALUE_INPUTS.ONLY_TARGETNAME_RECORDS_WHERE", { targetName })}
            />
            <label htmlFor="rule-filter" className="flex cursor-pointer items-center gap-2 text-xs text-foreground/80">
              <ConditionTag kind="filter" />
              {t("RULE_VALUE_INPUTS.ONLY_TARGETNAME_RECORDS_WHERE", { targetName })}
              {!draft.filterOn && (
                <span className="text-muted-foreground">
                  {t(skipsDeleted ? "RULE_VALUE_INPUTS.OFF_ANY_LIVE_RECORD" : "RULE_VALUE_INPUTS.OFF_ANY_RECORD")}
                </span>
              )}
            </label>
          </div>
          {draft.filterOn && (
            <>
              <ConditionEditor
                kind="filter"
                draft={filter}
                fields={filterFieldsOf(target)}
                showErrors={!!showConditionErrors}
                targetName={targetName}
                onChange={(targetFilter) => onChange({ targetFilter })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("RULE_VALUE_INPUTS.COMPARED_WITH_FIXED_VALUES")}{skipsDeleted ? ` ${t("RULE_VALUE_INPUTS.DELETED_TARGETNAME_RECORDS_NEVER_COUNT", { targetName })}` : ""}
              </p>
            </>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {mustNotExist
          ? t("RULE_VALUE_INPUTS.INSERTS_AND_UPDATES_ARE_REFUSED_WHEN", { targetName, ownFieldName })
          : t("RULE_VALUE_INPUTS.INSERTS_AND_UPDATES_ARE_REFUSED_WHEN_2")}
      </p>
    </div>
  );
}

export function RuleValueInputs({
  draft,
  fieldType,
  enumValues,
  projectKey,
  variables,
  fieldName,
  error,
  patternAction,
  olderReference,
  showConditionErrors,
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
  /** An older Reference rule being edited: deleted target records still count (D2). */
  olderReference?: boolean;
  /** Show each condition row's error: once the rule was saved (D6). */
  showConditionErrors?: boolean;
  onChange: (patch: Partial<RuleDraft>) => void;
}>) {
  const { t } = useT(DATA_GATEWAY_VALIDATION_MODULE);
  const input = VALIDATION_TYPE_META[draft.type]?.input;
  const kind = valueKindForField(fieldType);
  const invalid = Boolean(error);
  const variableOptions = variables?.schemaName ? fittingVariables(fieldType, variables, fieldName) : null;
  const shortField = (fieldName ?? "").split(".").pop() || t("RULE_VALUE_INPUTS.THE_VALUE");
  // Dates relative to now: on date-time properties, in ordering rules (Genesis ValidationRuleCheck).
  const nowSentence = (sentenceKey: string) =>
    fieldType === "DateTime" && ORDERING_TYPES.includes(draft.type)
      ? (bound: string) => t(sentenceKey, { field: shortField, bound })
      : undefined;

  const lengthPlaceholder = draft.type === VALIDATION_TYPE.MinLength ? t("RULE_VALUE_INPUTS.AT_LEAST") : t("RULE_VALUE_INPUTS.AT_MOST");
  const comparisonHeading = draft.type === VALIDATION_TYPE.Equal || draft.type === VALIDATION_TYPE.NotEqual ? t("RULE_VALUE_INPUTS.VALUE") : t("RULE_VALUE_INPUTS.COMPARED_WITH");
  const valueListLabel = draft.type === VALIDATION_TYPE.NotIn ? t("RULE_VALUE_INPUTS.REFUSED_VALUES") : t("RULE_VALUE_INPUTS.ALLOWED_VALUES");
  const countPlaceholder = draft.type === VALIDATION_TYPE.MinItems ? t("RULE_VALUE_INPUTS.AT_LEAST") : t("RULE_VALUE_INPUTS.AT_MOST");

  const body = (() => {
    switch (input) {
      case "none":
        if (draft.type === VALIDATION_TYPE.UniqueItems) {
          return <p className="text-[11px] leading-relaxed text-muted-foreground">{t("RULE_VALUE_INPUTS.FAILS_WHEN_THE_LIST_HOLDS_THE")}</p>;
        }
        return (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("RULE_VALUE_INPUTS.FAILS_WHEN_THE_VALUE_IS_MISSING")}
            {draft.whenOn ? ` ${t("RULE_VALUE_INPUTS.WITH_A_CONDITION_IT_FAILS_EVEN", { shortField })}` : ""}
          </p>
        );
      case "regex":
        return (
          <Labelled label={t("RULE_VALUE_INPUTS.PATTERN")} action={patternAction}>
            <Textarea
              placeholder={t("RULE_VALUE_INPUTS.E_G_A_ZA_Z")}
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn("resize-none rounded-md border-border/60 bg-background font-mono text-[12.5px]", invalid && "border-rose-500")}
              rows={3}
            />
          </Labelled>
        );
      case "length":
        return (
          <Labelled label={t("RULE_VALUE_INPUTS.CHARACTERS")}>
            <Input
              type="number"
              min={0}
              aria-label={t("RULE_VALUE_INPUTS.LENGTH")}
              placeholder={lengthPlaceholder}
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
            />
          </Labelled>
        );
      case "lengthRange":
        return (
          <div className="flex gap-2.5">
            <Labelled label={t("RULE_VALUE_INPUTS.MIN_CHARACTERS")}>
              <Input type="number" min={0} aria-label={t("RULE_VALUE_INPUTS.MIN_LENGTH")} value={draft.value} onChange={(e) => onChange({ value: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} />
            </Labelled>
            <Labelled label={t("RULE_VALUE_INPUTS.MAX_CHARACTERS")}>
              <Input type="number" min={0} aria-label={t("RULE_VALUE_INPUTS.MAX_LENGTH")} value={draft.secondaryValue} onChange={(e) => onChange({ secondaryValue: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} />
            </Labelled>
          </div>
        );
      case "value":
        return (
          <ComparisonValue
            kind={kind}
            heading={comparisonHeading}
            label={t("RULE_VALUE_INPUTS.VALUE")}
            value={draft.value}
            enumValues={enumValues}
            invalid={invalid}
            variableOptions={variableOptions}
            nowSentence={nowSentence(BOUND_SENTENCE_KEY[draft.type] ?? "")}
            onChange={(value) => onChange({ value })}
          />
        );
      case "valueList":
        return (
          <Labelled label={valueListLabel}>
            <ValueListInput values={draft.values ?? []} enumValues={enumValues} kind={kind} invalid={invalid} fieldLabel={shortField} onChange={(values) => onChange({ values })} />
          </Labelled>
        );
      case "count":
        return (
          <Labelled label={t("RULE_VALUE_INPUTS.ITEMS")}>
            <Input
              type="number"
              min={0}
              aria-label={t("RULE_VALUE_INPUTS.ITEMS")}
              placeholder={countPlaceholder}
              value={draft.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn(CONTROL_CLASS, "font-mono", invalid && "border-rose-500")}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("RULE_VALUE_INPUTS.A_SAVE_WITHOUT_SHORTFIELD_ISN_T", { shortField })}
            </p>
          </Labelled>
        );
      case "valueRange":
        // Side by side when both bounds are fixed; stacked when each box carries its own
        // Expression button, which needs the full width.
        return (
          <div className={cn("flex gap-2.5", variableOptions?.length && "flex-col gap-3.5")}>
            <ComparisonValue kind={kind} heading={t("RULE_VALUE_INPUTS.FROM")} label={t("RULE_VALUE_INPUTS.MIN")} value={draft.value} enumValues={enumValues} invalid={invalid} variableOptions={variableOptions} nowSentence={nowSentence(BOUND_SENTENCE_KEY[T.GreaterThanOrEqual])} onChange={(value) => onChange({ value })} />
            <ComparisonValue kind={kind} heading={t("RULE_VALUE_INPUTS.TO")} label={t("RULE_VALUE_INPUTS.MAX")} value={draft.secondaryValue} enumValues={enumValues} invalid={invalid} variableOptions={variableOptions} nowSentence={nowSentence(BOUND_SENTENCE_KEY[T.LessThanOrEqual])} onChange={(secondaryValue) => onChange({ secondaryValue })} />
          </div>
        );
      case "reference":
        return (
          <ReferenceInputs
            draft={draft}
            fieldType={fieldType}
            projectKey={projectKey}
            ownSchemaName={variables?.schemaName}
            ownFieldName={shortField}
            olderReference={olderReference}
            showConditionErrors={showConditionErrors}
            onChange={onChange}
          />
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
