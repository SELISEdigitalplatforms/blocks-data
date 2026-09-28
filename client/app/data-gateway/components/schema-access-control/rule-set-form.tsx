"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Card } from "@/components/ui-kits/card/card";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import { PrincipalSelector } from "@/data-gateway/components/schema-access-control/principal-selector";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import {
  AUTH_FIELD_OPTIONS,
  AUTH_STRING_FIELDS,
  COMPARE_SOURCE_OPTIONS,
  FIELD_TYPE_CATEGORY,
  IN_OPERATORS,
  LOGICAL_OPERATOR,
  MAX_NESTED_FIELD_DEPTH,
  NULL_OPERATORS,
  OPERATORS_BY_CATEGORY,
  OPERATOR_TO_NUMBER,
  POLICY_TYPE,
  RULE_OPERATORS,
  RULE_SOURCE_OPTIONS,
  RULE_SOURCE_TYPES,
  SOURCE_TYPE_TO_NUMBER,
  getFieldTypeCategory,
  type FieldTypeCategory,
} from "@/data-gateway/constants/schema-access-control";
import type { PresetRuleSet } from "@/data-gateway/utils/access-presets";
import type {
  ICreatePolicyPayload,
  IPolicyItem,
  IPolicyRule,
  IPolicyRuleGroup,
  IUpdatePolicyPayload,
} from "@/data-gateway/models/data-service";
import { policyRuleToFormRow } from "@/data-gateway/utils/schema-access-control.utils";
import { StatusSnackbar } from "../primitives";
import type { TransientStatus } from "@/data-gateway/hooks/use-transient-status";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@radix-ui/react-icons";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ChevronDown, Plus, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const ruleRowSchema = z
  .object({
    source: z.string().min(1, "Source is required"),
    field: z.string().min(1, "Field is required"),
    operator: z.string().min(1, "Operator is required"),
    compareSource: z.string().default(""),
    compareValue: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (NULL_OPERATORS.includes(data.operator)) return;

    const directValueOps = ["REGEX", "START_WITH", "END_WITH"];
    if (directValueOps.includes(data.operator)) {
      if (!data.compareValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Value is required",
          path: ["compareValue"],
        });
      }
      return;
    }

    if (!data.compareSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Compare source is required",
        path: ["compareSource"],
      });
    }
    if (!data.compareValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Compare value is required",
        path: ["compareValue"],
      });
    }
  });

const ruleSetSchema = z.object({
  name: z.string().trim().min(1, "Rule Set Name is required"),
  logicalOperator: z.enum(["AND", "OR"], {
    required_error: "Please select a rule relation",
  }),
  rules: z.array(ruleRowSchema).min(1, "At least one complete rule is required"),
});

type RuleSetFormValues = z.infer<typeof ruleSetSchema>;

type RuleCellKey = "source" | "field" | "operator" | "compareSource" | "compareValue";

interface SchemaField {
  name: string;
  type?: string | null;
  isArray?: boolean | null;
  /** Nested properties for child-schema (object) fields, e.g. AddressInfo's own fields */
  fields?: SchemaField[];
}

interface SchemaFieldOption {
  label: string;
  value: string;
  type?: string | null;
  isArray?: boolean | null;
}

/**
 * Flattens a (possibly nested) schema field tree into dotted-path leaf options,
 * e.g. AddressInfo.StreetNo, capped at MAX_NESTED_FIELD_DEPTH to mirror the
 * server's GraphQlConstant.MaxNestedLevelIterationLimit.
 */
const flattenSchemaFields = (
  items: SchemaField[],
  parentPath = "",
  depth = 1,
): SchemaFieldOption[] =>
  items.flatMap((f) => {
    const value = parentPath ? `${parentPath}.${f.name}` : f.name;
    if (f.fields?.length) {
      if (depth >= MAX_NESTED_FIELD_DEPTH) return [];
      return flattenSchemaFields(f.fields, value, depth + 1);
    }
    return [{ label: value, value, type: f.type, isArray: f.isArray }];
  });

interface RuleSetFormProps {
  onCancel?: () => void;
  schemaFields?: SchemaField[];
  schemaName: string;
  schemaId: string;
  operation: number;
  fieldNames: string[];
  editingPolicy?: IPolicyItem;
  level: "row" | "column";
  /**
   * Starting values from a preset. It fills the form rather than saving, so the
   * rules are reviewed before they grant anything, and so presets and the form
   * share one payload builder. Ignored while editing an existing set.
   */
  seed?: PresetRuleSet;
  /**
   * Hands the built payload back to the parent instead of sending it — this
   * form doesn't call the create/update API itself. The parent sends it
   * straight away (first saving a pending access-level change, if there is
   * one, so the rule always lands against the right tier).
   */
  onStage: (staged: {
    payload: ICreatePolicyPayload | IUpdatePolicyPayload;
    isEditMode: boolean;
  }) => void;
  /** True while `onStage` has the save in flight. */
  isSubmitting?: boolean;
  /** The parent's most recent save result, shown in this footer's status
   *  slot instead of a toast — see `useTransientStatus`. */
  status?: TransientStatus | null;
}

export const RuleSetForm = ({
  onCancel,
  schemaFields = [],
  schemaName,
  schemaId,
  operation,
  fieldNames,
  editingPolicy,
  level,
  seed,
  onStage,
  isSubmitting = false,
  status = null,
}: RuleSetFormProps) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const isEditMode = !!editingPolicy;

  const form = useForm<RuleSetFormValues>({
    resolver: zodResolver(ruleSetSchema),
    mode: "onChange",
    defaultValues: {
      name: editingPolicy?.policyName ?? seed?.name ?? "",
      logicalOperator: editingPolicy
        ? editingPolicy.ruleGroup.logicalOperator === LOGICAL_OPERATOR.OR
          ? "OR"
          : "AND"
        : (seed?.logicalOperator ?? "AND"),
      rules: editingPolicy
        ? editingPolicy.ruleGroup.rules.map(policyRuleToFormRow)
        : (seed?.rules ?? []),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules",
  });

  /**
   * Which condition row + column is currently showing its editor instead of
   * its filled/"Not set" chip. One piece of state rather than a hook per row,
   * since rows are rendered from a .map() and hooks can't live inside a loop.
   *
   * `openCellRef` mirrors it synchronously (updated the instant it changes,
   * not after React's next render). A popover-to-popover handoff — clicking
   * compareSource's trigger while operator's is still open — fires two
   * `onOpenChange` calls inside the SAME click: our own (advancing to
   * compareSource) and Radix's dismiss layer for operator, which sees that
   * click as "outside" and asks to close. Both land in one React batch, so
   * whichever runs last wins — and operator's dismiss handler still closes
   * over the pre-click `openCell`, so its "am I still the active cell?" guard
   * reads stale and fires anyway, clobbering the advance. Reading the ref
   * instead of the closed-over state keeps that guard correct mid-event.
   */
  const [openCell, setOpenCell] = useState<{ ruleId: string; key: RuleCellKey } | null>(null);
  const openCellRef = useRef(openCell);
  const setOpenCellSynced = (value: typeof openCell) => {
    openCellRef.current = value;
    setOpenCell(value);
  };

  const watchedRules = form.watch("rules");
  const isRuleComplete = (rule: RuleSetFormValues["rules"][number]) => {
    if (!rule.source || !rule.field || !rule.operator) return false;
    if (NULL_OPERATORS.includes(rule.operator)) return true;
    if (["REGEX", "START_WITH", "END_WITH"].includes(rule.operator)) {
      return Boolean(rule.compareValue);
    }
    return Boolean(rule.compareSource && rule.compareValue);
  };
  const allRulesComplete = watchedRules.length > 0 && watchedRules.every(isRuleComplete);
  const hasCompleteRule = watchedRules.some(isRuleComplete);

  /** One blank row. The literal was written out at both Add Rule triggers. */
  const addRule = () =>
    append({
      source: "",
      field: "",
      operator: "",
      compareSource: "",
      compareValue: "",
    });

  /**
   * Condition row elements, keyed by their stable field id, so a newly
   * appended row can be scrolled into view and focused. It's added at the
   * end of the list — easy to miss if the form is already scrolled or has
   * several rules — and the form's own content scrolls independently of the
   * page now, so nothing else would carry the view down to it.
   */
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousRuleCountRef = useRef(fields.length);
  useEffect(() => {
    if (fields.length > previousRuleCountRef.current) {
      const newRow = fields[fields.length - 1];
      const rowEl = newRow && rowRefs.current.get(newRow.id);
      rowEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      rowEl?.querySelector<HTMLElement>("button")?.focus();
    }
    previousRuleCountRef.current = fields.length;
  }, [fields]);

  /** Schema fields flattened to dotted-path leaf options (e.g. AddressInfo.StreetNo) */
  const schemaFieldOptions = flattenSchemaFields(schemaFields);

  const getFieldOptions = (source: string) => {
    if (source === RULE_SOURCE_TYPES.AUTH) return AUTH_FIELD_OPTIONS;
    if (source === RULE_SOURCE_TYPES.SCHEMA_FIELD) return schemaFieldOptions;
    return [];
  };

  /** Resolve field type category from left source + field name */
  const getLeftFieldCategory = (
    source: string,
    fieldName: string,
  ): FieldTypeCategory | undefined => {
    if (!source || !fieldName) return undefined;
    if (source === RULE_SOURCE_TYPES.AUTH) {
      return AUTH_FIELD_OPTIONS.find((o) => o.value === fieldName)?.category;
    }
    if (source === RULE_SOURCE_TYPES.SCHEMA_FIELD) {
      const sf = schemaFieldOptions.find((f) => f.value === fieldName);
      return getFieldTypeCategory(sf?.type, sf?.isArray);
    }
    return undefined;
  };

  /** Filter RULE_OPERATORS to those valid for the category (all if unknown) */
  const getFilteredOperators = (
    category: FieldTypeCategory | undefined,
    source?: string,
    fieldName?: string,
  ) => {
    if (!category) return RULE_OPERATORS;
    const allowed = [...OPERATORS_BY_CATEGORY[category]];
    // Auth → roles: also allow IN / NOT_IN
    if (source === RULE_SOURCE_TYPES.AUTH && fieldName === "roles" && !allowed.includes("IN")) {
      allowed.push("IN", "NOT_IN");
    }
    return RULE_OPERATORS.filter((op) => allowed.includes(op.value));
  };

  /** Left-side source options with the schema field option labeled by the current schema's name */
  const ruleSourceOptions = RULE_SOURCE_OPTIONS.map((opt) =>
    opt.value === RULE_SOURCE_TYPES.SCHEMA_FIELD && schemaName
      ? { ...opt, label: schemaName }
      : opt,
  );

  /** Compare source options with the schema field option labeled by the current schema's name */
  const compareSourceOptions = COMPARE_SOURCE_OPTIONS.map((opt) =>
    opt.value === RULE_SOURCE_TYPES.SCHEMA_FIELD && schemaName
      ? { ...opt, label: schemaName }
      : opt,
  );

  /** Filter compare source options by category */
  const getFilteredCompareSourceOptions = (category: FieldTypeCategory | undefined) => {
    if (!category) return compareSourceOptions;
    // Numeric: no auth fields are numeric, so remove Auth
    if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
      return compareSourceOptions.filter((o) => o.value !== RULE_SOURCE_TYPES.AUTH);
    }
    return compareSourceOptions;
  };

  /** Filter right-side field options based on left operand category */
  const getRightFieldOptions = (cmpSource: string, category: FieldTypeCategory | undefined) => {
    if (cmpSource === RULE_SOURCE_TYPES.AUTH) {
      if (!category) return AUTH_FIELD_OPTIONS;
      // Array left → only string auth fields (userId, email)
      if (category === FIELD_TYPE_CATEGORY.ARRAY) return AUTH_STRING_FIELDS;
      return AUTH_FIELD_OPTIONS;
    }
    if (cmpSource === RULE_SOURCE_TYPES.SCHEMA_FIELD) {
      if (!category) return schemaFieldOptions;
      return schemaFieldOptions.filter((f) => {
        const fCat = getFieldTypeCategory(f.type, f.isArray);
        if (category === FIELD_TYPE_CATEGORY.STRING) {
          return fCat === FIELD_TYPE_CATEGORY.STRING || fCat === FIELD_TYPE_CATEGORY.ARRAY;
        }
        if (category === FIELD_TYPE_CATEGORY.ARRAY) {
          // Collection operators can compare against either one string or
          // another string-array schema field.
          return getFieldTypeCategory(f.type, false) === FIELD_TYPE_CATEGORY.STRING;
        }
        if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
          return getFieldTypeCategory(f.type, false) === FIELD_TYPE_CATEGORY.NUMERIC;
        }
        return true;
      });
    }
    return [];
  };

  const buildRuleGroup = (
    operator: string,
    ruleRows: RuleSetFormValues["rules"],
  ): IPolicyRuleGroup => {
    const logicalOperator = operator === "AND" ? LOGICAL_OPERATOR.AND : LOGICAL_OPERATOR.OR;

    const directValueOps = ["REGEX", "START_WITH", "END_WITH"];
    const mappedRules: IPolicyRule[] = ruleRows.map((r) => {
      const isContain = IN_OPERATORS.includes(r.operator);
      const isDirectValue = directValueOps.includes(r.operator);
      const isStatic = r.compareSource === RULE_SOURCE_TYPES.STATIC_VALUE;

      let rightOperand = "";
      let rightOperands: string[] = [];
      let staticValue: string | string[] | null = null;

      if (isDirectValue) {
        staticValue = r.compareValue || null;
      } else if (isContain) {
        if (isStatic) {
          // The policy API stores principal multi-selections as a single,
          // comma-delimited value; the backend expands it during evaluation.
          staticValue = r.compareValue;
        } else {
          rightOperands = r.compareValue
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
          rightOperand = rightOperands[0] ?? "";
        }
      } else {
        rightOperand = !isStatic ? r.compareValue : "";
        staticValue = isStatic ? r.compareValue || null : null;
      }

      return {
        leftSource: SOURCE_TYPE_TO_NUMBER[r.source] ?? 0,
        leftOperand: r.field,
        operator: OPERATOR_TO_NUMBER[r.operator] ?? 0,
        rightSource:
          SOURCE_TYPE_TO_NUMBER[r.compareSource] ??
          SOURCE_TYPE_TO_NUMBER[RULE_SOURCE_TYPES.STATIC_VALUE],
        rightOperand,
        rightOperands,
        staticValue,
      };
    });

    return {
      logicalOperator,
      rules: mappedRules,
      nestedGroups: [],
    };
  };

  const onSubmit = (values: RuleSetFormValues) => {
    const ruleGroup = buildRuleGroup(values.logicalOperator, values.rules);

    if (isEditMode && editingPolicy?.itemId) {
      const payload: IUpdatePolicyPayload = {
        itemId: editingPolicy.itemId,
        policyName: values.name,
        policyDescription: editingPolicy.policyDescription ?? "Generated from Rule Builder",
        policyType: level === "row" ? POLICY_TYPE.ROW : POLICY_TYPE.COLUMN,
        operation,
        schemaName,
        schemaId,
        fieldNames: editingPolicy.fieldNames,
        ruleGroup,
        priority: editingPolicy.priority,
        isAllowPolicy: editingPolicy.isAllowPolicy,
        projectKey,
      };
      onStage({ payload, isEditMode: true });
    } else {
      const payload: ICreatePolicyPayload = {
        policyName: values.name,
        policyDescription: "Generated from Rule Builder",
        policyType: level === "row" ? POLICY_TYPE.ROW : POLICY_TYPE.COLUMN,
        operation,
        schemaName,
        schemaId,
        fieldNames,
        ruleGroup,
        priority: 1,
        isAllowPolicy: true,
        projectKey,
      };
      onStage({ payload, isEditMode: false });
    }
  };

  const submitRuleSet = form.handleSubmit(onSubmit);
  const showLegacyRuleSetDetails = false;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <Form {...form}>
        <form
          onSubmit={(e) => {
            // Schema structure wraps the page in <form>; drawer portals can still leave edge cases
            // where submit bubbles or implicit submit targets the wrong form — keep policy saves isolated.
            e.preventDefault();
            e.stopPropagation();
            void submitRuleSet(e);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Everything but the footer scrolls in its own region, bounded by
              the flex column above. A `position: sticky` footer here would
              only sit flush with the last rule when there's nothing to
              scroll — sticky never reaches for the bottom of unused space,
              it just holds position once you'd otherwise scroll past it. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/40 pb-4 pt-2">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {isEditMode ? "Edit rule set" : "New rule set"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Define the conditions that grant access.
                </p>
              </div>
            </div>
            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <div className="flex items-center gap-3">
                    <FormLabel className="shrink-0">
                      Rule Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input className="h-9 flex-1" placeholder="Enter a rule name" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Rules.
              This was a bordered, tinted, p-4 panel wrapping per-rule cards
              that were themselves bordered and p-4 — two frames and two sets
              of padding around every control, in a narrow column. The section
              is now a plain heading plus the list, matching how "Who is
              allowed" and "Multi-rule relations" above it are labelled, so a
              rule card is the only box on screen. */}
            <div className="flex flex-col">
              <section>
                <FormField
                  control={form.control}
                  name="logicalOperator"
                  render={({ field }) => (
                    <FormItem className="mb-4 space-y-1">
                      <div className="flex items-center gap-3">
                        <FormLabel className="shrink-0">Rule matching</FormLabel>
                        <FormControl>
                          <div
                            role="radiogroup"
                            aria-label="Multi-rule relations"
                            className="flex items-center gap-2"
                          >
                            {(
                              [
                                { value: "AND", label: "AND", description: "Match all" },
                                { value: "OR", label: "OR", description: "Match any" },
                              ] as const
                            ).map((option) => {
                              const isSelected = field.value === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  role="radio"
                                  aria-label={option.description}
                                  aria-checked={isSelected}
                                  onClick={() => field.onChange(option.value)}
                                  className={cn(
                                    "rounded-sm border px-3 py-1.5 text-xs transition-colors",
                                    isSelected
                                      ? "border-primary/30 bg-primary/10 text-foreground"
                                      : "border-border/60 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                                  )}
                                >
                                  <span className="font-semibold">{option.label}</span>
                                  <span className="ml-1.5">({option.description})</span>
                                </button>
                              );
                            })}
                          </div>
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {fields.length === 0 ? (
                  <div className="flex flex-col justify-center gap-4">
                    <p className="text-center text-sm text-muted-foreground">
                      No rules added yet. Add a rule to define who can view.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="dg-interactive flex w-full items-center justify-center gap-2 border-dashed text-muted-foreground hover:text-foreground"
                      onClick={addRule}
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Rule</span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <div className="grid flex-1 grid-cols-5 gap-2 text-center">
                          <span>Left operand</span>
                          <span>Left value</span>
                          <span>Operator</span>
                          <span>Right operand</span>
                          <span>Right value</span>
                        </div>
                        <span className="w-7 shrink-0" aria-hidden="true" />
                      </div>
                      <div className="mt-3 flex flex-col gap-3">
                        {fields.map((ruleField, index) => {
                          const source = form.watch(`rules.${index}.source`);
                          const leftField = form.watch(`rules.${index}.field`);
                          const operatorValue = form.watch(`rules.${index}.operator`);
                          const compareSource = form.watch(`rules.${index}.compareSource`);
                          const compareValue = form.watch(`rules.${index}.compareValue`);
                          const fieldOptions = getFieldOptions(source);
                          const category = getLeftFieldCategory(source, leftField);
                          const filteredOperators = getFilteredOperators(
                            category,
                            source,
                            leftField,
                          );
                          const filteredCompareSourceOptions =
                            getFilteredCompareSourceOptions(category);
                          const compareFieldOptions = getRightFieldOptions(compareSource, category);
                          const isStaticValue = source === RULE_SOURCE_TYPES.STATIC_VALUE;
                          const isNullOperator = NULL_OPERATORS.includes(operatorValue);
                          const isCompareStatic = compareSource === RULE_SOURCE_TYPES.STATIC_VALUE;
                          const isInOp = IN_OPERATORS.includes(operatorValue);
                          const isDirectValueOp = ["REGEX", "START_WITH", "END_WITH"].includes(
                            operatorValue,
                          );
                          /**
                           * Tenant-scoped principal selector eligibility.
                           *
                           * Requires the operator to be in a POSITIVE eligible set rather than merely
                           * "not excluded", so nothing queries IAM before an operator is chosen.
                           *
                           * `roles` is an ARRAY field, so its operator surface is
                           * CONTAIN/NOT_CONTAIN (+ IN/NOT_IN, which getFilteredOperators adds) - it
                           * has no EQUAL. The spec's H1/example name EQUAL for roles, which this UI
                           * cannot produce; CONTAIN/NOT_CONTAIN are its scalar operators.
                           * `userId` is a STRING field, so EQUAL/NOT_EQUAL and also IN/NOT_IN are
                           * reachable - hence userId can legitimately be multi-select.
                           */
                          const principalScalarOps =
                            leftField === "roles"
                              ? ["CONTAIN", "NOT_CONTAIN"]
                              : ["EQUAL", "NOT_EQUAL"];
                          const showPrincipalSelector =
                            source === RULE_SOURCE_TYPES.AUTH &&
                            (leftField === "roles" ||
                              leftField === "userId" ||
                              leftField === "email") &&
                            isCompareStatic &&
                            (principalScalarOps.includes(operatorValue) ||
                              IN_OPERATORS.includes(operatorValue));

                          const selectedInValues =
                            isInOp && compareValue
                              ? compareValue
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              : [];

                          const sourceLabel = ruleSourceOptions.find(
                            (option) => option.value === source,
                          )?.label;
                          const leftFieldLabel =
                            fieldOptions.find((option) => option.value === leftField)?.label ??
                            leftField;
                          const operatorLabel = RULE_OPERATORS.find(
                            (option) => option.value === operatorValue,
                          )?.label;
                          const compareSourceLabel = filteredCompareSourceOptions.find(
                            (option) => option.value === compareSource,
                          )?.label;
                          const compareValueLabel =
                            compareFieldOptions.find((option) => option.value === compareValue)
                              ?.label ?? compareValue;

                          const isCellActive = (key: RuleCellKey) =>
                            openCell?.ruleId === ruleField.id && openCell.key === key;

                          const openCellFor = (key: RuleCellKey | null) =>
                            setOpenCellSynced(key ? { ruleId: ruleField.id, key } : null);

                          /**
                           * One entry per table column, always rendered so a rule row stays
                           * aligned under the header regardless of how much of it is filled in.
                           * `applicable` hides a column the current operator has no use for
                           * (e.g. right side for a null-check); `reachable` gates whether an
                           * empty column can be opened yet (its prerequisite column is set).
                           */
                          const cellDefs: {
                            key: RuleCellKey;
                            title: string;
                            label: string | undefined;
                            applicable: boolean;
                            reachable: boolean;
                          }[] = [
                            {
                              key: "source",
                              title: "Left operand",
                              label: sourceLabel,
                              applicable: true,
                              reachable: true,
                            },
                            {
                              key: "field",
                              title: "Left value",
                              label: leftFieldLabel,
                              applicable: true,
                              reachable: Boolean(source),
                            },
                            {
                              key: "operator",
                              title: "Operator",
                              label: operatorLabel,
                              applicable: true,
                              reachable: Boolean(leftField),
                            },
                            {
                              key: "compareSource",
                              title: "Right operand",
                              label: compareSourceLabel,
                              applicable: !isNullOperator && !isDirectValueOp,
                              reachable: Boolean(operatorValue),
                            },
                            {
                              key: "compareValue",
                              title: "Right value",
                              label: compareValueLabel,
                              applicable: !isNullOperator,
                              reachable: isDirectValueOp
                                ? Boolean(operatorValue)
                                : Boolean(compareSource),
                            },
                          ];
                          const showDetachedEditor = false;

                          /**
                           * Left operand, Right operand and Operator are each a plain list of
                           * fixed options, so picking one is a single click on a popover instead
                           * of clicking the chip open, then clicking the Select trigger it reveals.
                           */
                          const pickSource = (value: string) => {
                            form.setValue(`rules.${index}.source`, value, { shouldValidate: true });
                            form.setValue(`rules.${index}.field`, "", { shouldValidate: true });
                            form.setValue(`rules.${index}.operator`, "", { shouldValidate: true });
                            form.setValue(`rules.${index}.compareSource`, "", {
                              shouldValidate: true,
                            });
                            form.setValue(`rules.${index}.compareValue`, "", {
                              shouldValidate: true,
                            });
                            openCellFor("field");
                          };

                          const pickField = (value: string) => {
                            form.setValue(`rules.${index}.field`, value, {
                              shouldValidate: true,
                            });
                            const newCategory = getLeftFieldCategory(source, value);
                            const allowedOperators = newCategory
                              ? OPERATORS_BY_CATEGORY[newCategory]
                              : null;
                            const currentOperator = form.getValues(`rules.${index}.operator`);
                            if (
                              allowedOperators &&
                              currentOperator &&
                              !allowedOperators.includes(currentOperator)
                            ) {
                              form.setValue(`rules.${index}.operator`, "", {
                                shouldValidate: true,
                              });
                            }
                            form.setValue(`rules.${index}.compareSource`, "", {
                              shouldValidate: true,
                            });
                            form.setValue(`rules.${index}.compareValue`, "", {
                              shouldValidate: true,
                            });
                            openCellFor(null);
                          };

                          const pickOperator = (value: string) => {
                            const wasIn = IN_OPERATORS.includes(operatorValue);
                            const willBeIn = IN_OPERATORS.includes(value);
                            form.setValue(`rules.${index}.operator`, value, {
                              shouldValidate: true,
                            });
                            if (
                              NULL_OPERATORS.includes(value) ||
                              ["REGEX", "START_WITH", "END_WITH"].includes(value)
                            ) {
                              form.setValue(`rules.${index}.compareSource`, "", {
                                shouldValidate: true,
                              });
                              form.setValue(`rules.${index}.compareValue`, "", {
                                shouldValidate: true,
                              });
                            } else if (wasIn !== willBeIn) {
                              form.setValue(`rules.${index}.compareValue`, "", {
                                shouldValidate: true,
                              });
                            }
                            // Never auto-opens compareSource: chaining straight from one
                            // popover into another within the same interaction is unreliable
                            // (two Radix popover layers racing to open/close together). Once
                            // reachable it shows as a plain "Not set" chip — one more click
                            // opens it, same as any other popover column.
                            openCellFor(
                              ["REGEX", "START_WITH", "END_WITH"].includes(value)
                                ? "compareValue"
                                : null,
                            );
                          };

                          const pickCompareSource = (value: string) => {
                            form.setValue(`rules.${index}.compareSource`, value, {
                              shouldValidate: true,
                            });
                            form.setValue(`rules.${index}.compareValue`, "", {
                              shouldValidate: true,
                            });
                            openCellFor("compareValue");
                          };

                          const pickCompareValue = (value: string) => {
                            form.setValue(`rules.${index}.compareValue`, value, {
                              shouldValidate: true,
                            });
                            openCellFor(null);
                          };

                          /**
                           * The popover-driven chip shared by source, operator and compareSource.
                           * Stays mounted (just with its trigger disabled) rather than appearing
                           * only once the column becomes reachable — a Popover that is inserted
                           * into the tree already `open` (the instant a pick advances to it) can
                           * mount before its own positioning is ready, so it never shows.
                           */
                          const renderOptionsChip = (
                            cell: (typeof cellDefs)[number],
                            options: { value: string; label: string }[],
                            onPick: (value: string) => void,
                          ) => {
                            const isFilled = Boolean(cell.label);
                            const isOperator = cell.key === "operator";
                            const isOperand = cell.key === "source" || cell.key === "compareSource";
                            const disabled = !cell.reachable;

                            return (
                              <Popover
                                key={cell.key}
                                open={!disabled && isCellActive(cell.key)}
                                onOpenChange={(open) => {
                                  // Guarded against the ref, not the closed-over `openCell`: a
                                  // stale dismiss signal for a popover a pick already advanced
                                  // past (operator -> compareSource, both inside one click) must
                                  // not clobber that newer state — see the state declaration.
                                  const stillActive =
                                    openCellRef.current?.ruleId === ruleField.id &&
                                    openCellRef.current.key === cell.key;
                                  if (!open && stillActive) openCellFor(null);
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    aria-label={
                                      disabled
                                        ? undefined
                                        : isFilled
                                          ? cell.label
                                          : `Set ${cell.title}`
                                    }
                                    aria-hidden={disabled || undefined}
                                    onClick={() => openCellFor(cell.key)}
                                    title={disabled ? undefined : `Edit ${cell.key}`}
                                    className={cn(
                                      "flex h-9 min-w-0 items-center justify-center truncate rounded-full border px-3 text-center text-xs font-semibold transition-colors",
                                      disabled
                                        ? "cursor-not-allowed border-dashed border-border/40 text-muted-foreground/40"
                                        : isFilled
                                          ? isOperator
                                            ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
                                            : isOperand
                                              ? "border-border/70 bg-muted/70 text-foreground hover:bg-muted"
                                              : "border-border/60 bg-background text-foreground hover:bg-muted/40"
                                          : "border-dashed border-border/50 bg-background text-muted-foreground hover:bg-muted/30",
                                    )}
                                  >
                                    <span className="block truncate">
                                      {isFilled ? cell.label : "Not set"}
                                    </span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-52 p-0" align="start">
                                  <Command>
                                    <CommandList>
                                      <CommandGroup>
                                        {options.map((option) => (
                                          <CommandItem
                                            key={option.value}
                                            onSelect={() => onPick(option.value)}
                                          >
                                            {option.label}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            );
                          };

                          const renderCellEditor = (key: RuleCellKey) => {
                            if (key === "field") {
                              return (
                                <FormField
                                  control={form.control}
                                  name={`rules.${index}.field`}
                                  render={({ field }) =>
                                    isStaticValue ? (
                                      <Input
                                        className="h-9 w-full min-w-0 rounded-full px-3 text-xs"
                                        placeholder="Enter value"
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={() => openCellFor(field.value ? "operator" : null)}
                                        autoFocus
                                      />
                                    ) : (
                                      <Select
                                        value={field.value || undefined}
                                        onValueChange={(value) => {
                                          field.onChange(value);
                                          const newCategory = getLeftFieldCategory(source, value);
                                          const allowedOperators = newCategory
                                            ? OPERATORS_BY_CATEGORY[newCategory]
                                            : null;
                                          const currentOperator = form.getValues(
                                            `rules.${index}.operator`,
                                          );
                                          if (
                                            allowedOperators &&
                                            currentOperator &&
                                            !allowedOperators.includes(currentOperator)
                                          ) {
                                            form.setValue(`rules.${index}.operator`, "", {
                                              shouldValidate: true,
                                            });
                                          }
                                          form.setValue(`rules.${index}.compareSource`, "", {
                                            shouldValidate: true,
                                          });
                                          form.setValue(`rules.${index}.compareValue`, "", {
                                            shouldValidate: true,
                                          });
                                          // Not auto-opened, same reasoning as the operator ->
                                          // compareSource handoff below.
                                          openCellFor(null);
                                        }}
                                      >
                                        <SelectTrigger className="h-9 w-full min-w-0 rounded-full px-3 text-xs">
                                          <SelectValue placeholder="Select field" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {fieldOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )
                                  }
                                />
                              );
                            }

                            return (
                              <FormField
                                control={form.control}
                                name={`rules.${index}.compareValue`}
                                render={({ field }) => {
                                  if (isDirectValueOp) {
                                    const placeholder =
                                      operatorValue === "REGEX"
                                        ? "Enter regex pattern"
                                        : operatorValue === "START_WITH"
                                          ? "Enter prefix"
                                          : "Enter suffix";
                                    return (
                                      <Input
                                        className="h-9 w-full min-w-0 rounded-full px-3 text-xs"
                                        placeholder={placeholder}
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={() => openCellFor(null)}
                                        autoFocus
                                      />
                                    );
                                  }

                                  if (showPrincipalSelector) {
                                    return (
                                      <div className="[&>button]:h-9 [&>button]:rounded-full [&>button]:px-3 [&>button]:text-xs">
                                        <PrincipalSelector
                                          entity={leftField === "roles" ? "role" : "user"}
                                          userValueField={
                                            leftField === "email" ? "email" : "itemId"
                                          }
                                          projectKey={projectKey}
                                          value={field.value}
                                          onChange={field.onChange}
                                          multiple
                                        />
                                      </div>
                                    );
                                  }

                                  if (isInOp && isCompareStatic) {
                                    return (
                                      <Input
                                        className="h-9 w-full min-w-0 rounded-full px-3 text-xs"
                                        placeholder="Values"
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={() => openCellFor(null)}
                                        autoFocus
                                      />
                                    );
                                  }

                                  if (isInOp && !isCompareStatic && compareSource) {
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="flex h-9 w-full min-w-0 items-center justify-between rounded-full border border-input bg-background px-3 text-xs"
                                          >
                                            <span className="truncate text-left">
                                              {selectedInValues.length > 0
                                                ? selectedInValues.join(", ")
                                                : "Select fields"}
                                            </span>
                                            <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-52 p-0" align="start">
                                          <Command>
                                            <CommandList>
                                              <CommandGroup>
                                                {compareFieldOptions.map((option) => {
                                                  const selected = selectedInValues.includes(
                                                    option.value,
                                                  );
                                                  return (
                                                    <CommandItem
                                                      key={option.value}
                                                      onSelect={() => {
                                                        const updated = selected
                                                          ? selectedInValues.filter(
                                                              (value) => value !== option.value,
                                                            )
                                                          : [...selectedInValues, option.value];
                                                        field.onChange(updated.join(","));
                                                      }}
                                                    >
                                                      <div
                                                        className={cn(
                                                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                          selected
                                                            ? "bg-primary text-primary-foreground"
                                                            : "opacity-50 [&_svg]:invisible",
                                                        )}
                                                      >
                                                        <CheckIcon className="h-4 w-4" />
                                                      </div>
                                                      <span>{option.label}</span>
                                                    </CommandItem>
                                                  );
                                                })}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  }

                                  return isCompareStatic ? (
                                    <Input
                                      className="h-9 w-full min-w-0 rounded-full px-3 text-xs"
                                      placeholder="Enter value"
                                      value={field.value}
                                      onChange={field.onChange}
                                      onBlur={() => openCellFor(null)}
                                      autoFocus
                                    />
                                  ) : (
                                    <Select
                                      value={field.value || undefined}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        openCellFor(null);
                                      }}
                                    >
                                      <SelectTrigger className="h-9 w-full min-w-0 rounded-full px-3 text-xs">
                                        <SelectValue placeholder="Select field" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {compareFieldOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  );
                                }}
                              />
                            );
                          };

                          return (
                            <Fragment key={ruleField.id}>
                              <Card
                                ref={(el) => {
                                  if (el) rowRefs.current.set(ruleField.id, el);
                                  else rowRefs.current.delete(ruleField.id);
                                }}
                                className="rounded-md border-0 bg-muted/15 p-3 shadow-none"
                              >
                                <span className="sr-only">Condition {index + 1}</span>
                                <div
                                  className="flex items-center gap-2"
                                  aria-label={`Condition ${index + 1} expression`}
                                >
                                  <div className="grid flex-1 grid-cols-5 gap-2">
                                    {cellDefs.map((cell) => {
                                      if (!cell.applicable) {
                                        return (
                                          <div
                                            key={cell.key}
                                            aria-hidden="true"
                                            className="flex h-9 items-center justify-center text-xs text-muted-foreground/30"
                                          >
                                            —
                                          </div>
                                        );
                                      }

                                      // Operand/operator columns are a fixed option list opened
                                      // with a single click on a popover — renderOptionsChip
                                      // handles the "not reachable yet" (disabled) state itself,
                                      // so its Popover stays mounted rather than appearing only
                                      // once the column opens.
                                      if (cell.key === "source") {
                                        return renderOptionsChip(
                                          cell,
                                          ruleSourceOptions,
                                          pickSource,
                                        );
                                      }
                                      if (cell.key === "operator") {
                                        return renderOptionsChip(
                                          cell,
                                          filteredOperators,
                                          pickOperator,
                                        );
                                      }
                                      if (cell.key === "compareSource") {
                                        return renderOptionsChip(
                                          cell,
                                          filteredCompareSourceOptions,
                                          pickCompareSource,
                                        );
                                      }
                                      if (cell.key === "field" && !isStaticValue) {
                                        return renderOptionsChip(cell, fieldOptions, pickField);
                                      }
                                      if (
                                        cell.key === "compareValue" &&
                                        !isDirectValueOp &&
                                        !isCompareStatic &&
                                        !showPrincipalSelector &&
                                        !isInOp
                                      ) {
                                        return renderOptionsChip(
                                          cell,
                                          compareFieldOptions,
                                          pickCompareValue,
                                        );
                                      }

                                      if (!cell.reachable) {
                                        return (
                                          <div
                                            key={cell.key}
                                            aria-hidden="true"
                                            className="flex h-9 min-w-0 items-center justify-center truncate rounded-full border border-dashed border-border/40 px-3 text-center text-xs text-muted-foreground/40"
                                          >
                                            Not set
                                          </div>
                                        );
                                      }

                                      if (isCellActive(cell.key)) {
                                        return (
                                          <div
                                            key={cell.key}
                                            className="min-w-0 rounded-full bg-muted/30 p-1"
                                          >
                                            {renderCellEditor(cell.key)}
                                          </div>
                                        );
                                      }

                                      // Only "field" and "compareValue" reach here — their editor
                                      // shape varies too much (input, select, popover multi-select,
                                      // the principal selector) for a single shared popover.
                                      const isFilled = Boolean(cell.label);

                                      return (
                                        <button
                                          key={cell.key}
                                          type="button"
                                          aria-label={isFilled ? cell.label : `Set ${cell.title}`}
                                          onClick={() => openCellFor(cell.key)}
                                          title={`Edit ${cell.key}`}
                                          className={cn(
                                            "flex h-9 min-w-0 items-center justify-center truncate rounded-full border px-3 text-center text-xs font-semibold transition-colors",
                                            isFilled
                                              ? "border-border/60 bg-background text-foreground hover:bg-muted/40"
                                              : "border-dashed border-border/50 bg-background text-muted-foreground hover:bg-muted/30",
                                          )}
                                        >
                                          <span className="block truncate">
                                            {isFilled ? cell.label : "Not set"}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    aria-label="Remove rule"
                                    onClick={() => remove(index)}
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                                  </Button>
                                </div>
                                {showDetachedEditor ? (
                                  <div className="flex min-w-0 flex-1 flex-col gap-5">
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-foreground">
                                          Compare field
                                        </span>
                                      </div>
                                      <div className="space-y-4">
                                        {/* Left Source */}
                                        {!source && (
                                          <div className="dg-rise-in">
                                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                              Source
                                            </span>
                                            <FormField
                                              control={form.control}
                                              name={`rules.${index}.source`}
                                              render={({ field }) => (
                                                <Select
                                                  value={field.value || undefined}
                                                  onValueChange={(v) => {
                                                    field.onChange(v);
                                                    form.setValue(`rules.${index}.field`, "", {
                                                      shouldValidate: true,
                                                    });
                                                    form.setValue(`rules.${index}.operator`, "", {
                                                      shouldValidate: true,
                                                    });
                                                    form.setValue(
                                                      `rules.${index}.compareSource`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                    form.setValue(
                                                      `rules.${index}.compareValue`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                  }}
                                                >
                                                  <SelectTrigger className="h-9 w-full min-w-0">
                                                    <SelectValue placeholder="Select source" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {ruleSourceOptions.map((opt) => (
                                                      <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              )}
                                            />
                                          </div>
                                        )}

                                        {/* Reveal each choice only when the previous one is complete. */}
                                        {source && !leftField && (
                                          <div className="dg-rise-in">
                                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                              {isStaticValue ? "Value" : "Property"}
                                            </span>
                                            <FormField
                                              control={form.control}
                                              name={`rules.${index}.field`}
                                              render={({ field }) =>
                                                isStaticValue ? (
                                                  <Input
                                                    className="h-9 w-full min-w-0"
                                                    placeholder="Enter value"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                  />
                                                ) : (
                                                  <Select
                                                    value={field.value || undefined}
                                                    onValueChange={(v) => {
                                                      field.onChange(v);
                                                      const newCat = getLeftFieldCategory(
                                                        source,
                                                        v,
                                                      );
                                                      const allowedOps = newCat
                                                        ? OPERATORS_BY_CATEGORY[newCat]
                                                        : null;
                                                      const curOp = form.getValues(
                                                        `rules.${index}.operator`,
                                                      );
                                                      if (
                                                        allowedOps &&
                                                        curOp &&
                                                        !allowedOps.includes(curOp)
                                                      ) {
                                                        form.setValue(
                                                          `rules.${index}.operator`,
                                                          "",
                                                          {
                                                            shouldValidate: true,
                                                          },
                                                        );
                                                      }
                                                      form.setValue(
                                                        `rules.${index}.compareSource`,
                                                        "",
                                                        {
                                                          shouldValidate: true,
                                                        },
                                                      );
                                                      form.setValue(
                                                        `rules.${index}.compareValue`,
                                                        "",
                                                        {
                                                          shouldValidate: true,
                                                        },
                                                      );
                                                    }}
                                                    disabled={!source}
                                                  >
                                                    <SelectTrigger className="h-9 w-full min-w-0">
                                                      <SelectValue placeholder="Select field" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {fieldOptions.map((opt) => (
                                                        <SelectItem
                                                          key={opt.value}
                                                          value={opt.value}
                                                        >
                                                          {opt.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                )
                                              }
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {leftField && !operatorValue && (
                                      <div className="dg-rise-in">
                                        <div>
                                          <span className="mb-2 block text-xs font-medium text-foreground">
                                            Operator
                                          </span>
                                          <FormField
                                            control={form.control}
                                            name={`rules.${index}.operator`}
                                            render={({ field }) => (
                                              <Select
                                                value={field.value || undefined}
                                                disabled={!leftField}
                                                onValueChange={(v) => {
                                                  const wasContain = IN_OPERATORS.includes(
                                                    field.value,
                                                  );
                                                  const willContain = IN_OPERATORS.includes(v);
                                                  field.onChange(v);
                                                  if (NULL_OPERATORS.includes(v)) {
                                                    form.setValue(
                                                      `rules.${index}.compareSource`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                    form.setValue(
                                                      `rules.${index}.compareValue`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                  } else if (
                                                    ["REGEX", "START_WITH", "END_WITH"].includes(v)
                                                  ) {
                                                    form.setValue(
                                                      `rules.${index}.compareSource`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                    form.setValue(
                                                      `rules.${index}.compareValue`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                  } else if (wasContain !== willContain) {
                                                    form.setValue(
                                                      `rules.${index}.compareValue`,
                                                      "",
                                                      {
                                                        shouldValidate: true,
                                                      },
                                                    );
                                                  }
                                                }}
                                              >
                                                <SelectTrigger className="h-9 w-full min-w-0">
                                                  <SelectValue placeholder="Operator" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {filteredOperators.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                      {opt.label}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            )}
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {operatorValue &&
                                      !isNullOperator &&
                                      (!compareValue || isInOp) && (
                                        <div className="dg-rise-in space-y-3 border-t border-border/40 pt-4">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-foreground">
                                              Compare against
                                            </span>
                                          </div>
                                          <div className="space-y-4">
                                            {!isDirectValueOp && !compareSource && (
                                              <div>
                                                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                                  Source
                                                </span>
                                                <FormField
                                                  control={form.control}
                                                  name={`rules.${index}.compareSource`}
                                                  render={({ field }) => (
                                                    <Select
                                                      value={field.value || undefined}
                                                      disabled={!operatorValue}
                                                      onValueChange={(v) => {
                                                        field.onChange(v);
                                                        form.setValue(
                                                          `rules.${index}.compareValue`,
                                                          "",
                                                          {
                                                            shouldValidate: true,
                                                          },
                                                        );
                                                      }}
                                                    >
                                                      <SelectTrigger className="h-9 w-full min-w-0">
                                                        <SelectValue placeholder="Select source" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {filteredCompareSourceOptions.map((opt) => (
                                                          <SelectItem
                                                            key={opt.value}
                                                            value={opt.value}
                                                          >
                                                            {opt.label}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  )}
                                                />
                                              </div>
                                            )}
                                            {(isDirectValueOp || compareSource) &&
                                              (!compareValue || isInOp) && (
                                                <div className="dg-rise-in">
                                                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                                    {isDirectValueOp || isCompareStatic
                                                      ? "Value"
                                                      : "Field"}
                                                  </span>
                                                  <FormField
                                                    control={form.control}
                                                    name={`rules.${index}.compareValue`}
                                                    render={({ field }) => {
                                                      // REGEX / START_WITH / END_WITH → direct string input, no compare source
                                                      if (isDirectValueOp) {
                                                        const placeholder =
                                                          operatorValue === "REGEX"
                                                            ? "Enter regex pattern"
                                                            : operatorValue === "START_WITH"
                                                              ? "Enter prefix"
                                                              : "Enter suffix";
                                                        return (
                                                          <Input
                                                            className="h-9 w-full min-w-0"
                                                            placeholder={placeholder}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                          />
                                                        );
                                                      }

                                                      // auth.roles / auth.userId + Static Value → tenant-scoped
                                                      // principal selector instead of free text. Placed ahead of the
                                                      // static-value branches below; every other rule shape falls
                                                      // through to its existing widget untouched.
                                                      if (showPrincipalSelector) {
                                                        return (
                                                          <PrincipalSelector
                                                            entity={
                                                              leftField === "roles"
                                                                ? "role"
                                                                : "user"
                                                            }
                                                            userValueField={
                                                              leftField === "email"
                                                                ? "email"
                                                                : "itemId"
                                                            }
                                                            projectKey={projectKey}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            multiple
                                                          />
                                                        );
                                                      }

                                                      // CONTAIN + Static Value → comma-separated input
                                                      if (isInOp && isCompareStatic) {
                                                        return (
                                                          <Input
                                                            className="h-9 w-full min-w-0"
                                                            placeholder="Enter comma-separated values"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                          />
                                                        );
                                                      }

                                                      // CONTAIN + Auth/Schema Fields → multi-select
                                                      if (
                                                        isInOp &&
                                                        !isCompareStatic &&
                                                        compareSource
                                                      ) {
                                                        return (
                                                          <Popover>
                                                            <PopoverTrigger asChild>
                                                              <button
                                                                type="button"
                                                                className="flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
                                                              >
                                                                <span className="truncate text-left">
                                                                  {selectedInValues.length > 0
                                                                    ? selectedInValues.join(", ")
                                                                    : "Select fields"}
                                                                </span>
                                                                <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                              </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent
                                                              className="w-52 p-0"
                                                              align="start"
                                                            >
                                                              <Command>
                                                                <CommandList>
                                                                  <CommandGroup>
                                                                    {compareFieldOptions.map(
                                                                      (opt) => {
                                                                        const isSelected =
                                                                          selectedInValues.includes(
                                                                            opt.value,
                                                                          );
                                                                        return (
                                                                          <CommandItem
                                                                            key={opt.value}
                                                                            onSelect={() => {
                                                                              const updated =
                                                                                isSelected
                                                                                  ? selectedInValues.filter(
                                                                                      (v) =>
                                                                                        v !==
                                                                                        opt.value,
                                                                                    )
                                                                                  : [
                                                                                      ...selectedInValues,
                                                                                      opt.value,
                                                                                    ];
                                                                              field.onChange(
                                                                                updated.join(","),
                                                                              );
                                                                            }}
                                                                          >
                                                                            <div
                                                                              className={cn(
                                                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                                                isSelected
                                                                                  ? "bg-primary text-primary-foreground"
                                                                                  : "opacity-50 [&_svg]:invisible",
                                                                              )}
                                                                            >
                                                                              <CheckIcon className="h-4 w-4" />
                                                                            </div>
                                                                            <span>{opt.label}</span>
                                                                          </CommandItem>
                                                                        );
                                                                      },
                                                                    )}
                                                                  </CommandGroup>
                                                                </CommandList>
                                                              </Command>
                                                            </PopoverContent>
                                                          </Popover>
                                                        );
                                                      }

                                                      // Default: Static → input, Auth/Schema → single select
                                                      return isCompareStatic ? (
                                                        <Input
                                                          className="h-9 w-full min-w-0"
                                                          placeholder="Enter value"
                                                          value={field.value}
                                                          onChange={field.onChange}
                                                        />
                                                      ) : (
                                                        <Select
                                                          value={field.value || undefined}
                                                          onValueChange={field.onChange}
                                                          disabled={!compareSource}
                                                        >
                                                          <SelectTrigger className="h-9 w-full min-w-0">
                                                            <SelectValue placeholder="Select field" />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            {compareFieldOptions.map((opt) => (
                                                              <SelectItem
                                                                key={opt.value}
                                                                value={opt.value}
                                                              >
                                                                {opt.label}
                                                              </SelectItem>
                                                            ))}
                                                          </SelectContent>
                                                        </Select>
                                                      );
                                                    }}
                                                  />
                                                </div>
                                              )}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                ) : null}
                              </Card>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </section>

              {showLegacyRuleSetDetails && (
                <section
                  aria-hidden={!hasCompleteRule}
                  className={cn(
                    "dg-rise-in mt-5 space-y-4 rounded-lg border border-border/50 bg-muted/10 p-4",
                    !hasCompleteRule && "hidden",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Rule set details</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Name this set, or add another completed condition.
                      </p>
                    </div>
                    {allRulesComplete && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Add Rule"
                        className="dg-interactive shrink-0 gap-1.5"
                        onClick={addRule}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add another rule</span>
                      </Button>
                    )}
                  </div>

                  <FormField
                    name="name"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Rule Set Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input className="h-9" placeholder="Enter a rule name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {fields.length > 1 && (
                    <FormField
                      control={form.control}
                      name="logicalOperator"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>When multiple rules apply</FormLabel>
                          <FormControl>
                            <div
                              role="radiogroup"
                              aria-label="Multi-rule relations"
                              className="flex w-full items-center gap-1 rounded-md border border-border/40 bg-background p-1"
                            >
                              {(
                                [
                                  { value: "AND", label: "Match all" },
                                  { value: "OR", label: "Match any" },
                                ] as const
                              ).map((option) => {
                                const isSelected = field.value === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    onClick={() => field.onChange(option.value)}
                                    className={cn(
                                      "flex-1 rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors",
                                      isSelected
                                        ? "bg-primary/15 text-primary"
                                        : "text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </section>
              )}
            </div>
          </div>

          {/* Always on screen below the scrollable content above, instead of
              at the end of the form's own content — on a rule set of any
              size, that used to mean scrolling past every rule to reach
              Save, and the view's own access-type footer was hidden while
              this form was open, leaving no visible action at all. One
              footer, both concerns. */}
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-card pt-3">
            <StatusSnackbar status={status} />
            <div className="flex items-center gap-2">
              {fields.length > 0 && allRulesComplete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Add Rule"
                  className="dg-interactive shrink-0 gap-1.5"
                  onClick={addRule}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add rule</span>
                </Button>
              )}
              <span className="flex-1 min-w-0 text-xs text-muted-foreground">
                {/* Sent the moment this is saved here — including the pending
                    access-level change first, if Custom was just picked — so
                    there's never a second, separate Save to remember. */}
                {isSubmitting ? "Saving…" : "Saves immediately"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!form.formState.isValid || isSubmitting}
                onClick={() => void submitRuleSet()}
              >
                {isEditMode ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};
