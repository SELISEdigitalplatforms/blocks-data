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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui-kits/popover/popover";
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
import {
  useCreatePolicy,
  useUpdatePolicy,
} from "@/data-gateway/hooks/use-configuration";
import type { PresetRuleSet } from "@/data-gateway/utils/access-presets";
import type {
  ICreatePolicyPayload,
  IPolicyItem,
  IPolicyRule,
  IPolicyRuleGroup,
  IUpdatePolicyPayload,
} from "@/data-gateway/models/data-service";
import { policyRuleToFormRow } from "@/data-gateway/utils/schema-access-control.utils";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@radix-ui/react-icons";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ChevronDown, Plus, X } from "lucide-react";
import { Fragment } from "react";
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
  rules: z
    .array(ruleRowSchema)
    .min(1, "At least one complete rule is required"),
});

type RuleSetFormValues = z.infer<typeof ruleSetSchema>;

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
}: RuleSetFormProps) => {
  const { mutateAsync: createPolicy, isPending: isCreating } =
    useCreatePolicy();
  const { mutateAsync: updatePolicy, isPending: isUpdating } =
    useUpdatePolicy();
  const isSaving = isCreating || isUpdating;
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
    if (
      source === RULE_SOURCE_TYPES.AUTH &&
      fieldName === "roles" &&
      !allowed.includes("IN")
    ) {
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
  const getFilteredCompareSourceOptions = (
    category: FieldTypeCategory | undefined,
  ) => {
    if (!category) return compareSourceOptions;
    // Numeric: no auth fields are numeric, so remove Auth
    if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
      return compareSourceOptions.filter(
        (o) => o.value !== RULE_SOURCE_TYPES.AUTH,
      );
    }
    return compareSourceOptions;
  };

  /** Filter right-side field options based on left operand category */
  const getRightFieldOptions = (
    cmpSource: string,
    category: FieldTypeCategory | undefined,
  ) => {
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
          return (
            fCat === FIELD_TYPE_CATEGORY.STRING ||
            fCat === FIELD_TYPE_CATEGORY.ARRAY
          );
        }
        if (category === FIELD_TYPE_CATEGORY.ARRAY) {
          // Collection operators can compare against either one string or
          // another string-array schema field.
          return (
            getFieldTypeCategory(f.type, false) === FIELD_TYPE_CATEGORY.STRING
          );
        }
        if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
          return (
            getFieldTypeCategory(f.type, false) ===
            FIELD_TYPE_CATEGORY.NUMERIC
          );
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
    const logicalOperator =
      operator === "AND" ? LOGICAL_OPERATOR.AND : LOGICAL_OPERATOR.OR;

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

  const onSubmit = async (values: RuleSetFormValues) => {
    const ruleGroup = buildRuleGroup(values.logicalOperator, values.rules);

    if (isEditMode && editingPolicy?.itemId) {
      const payload: IUpdatePolicyPayload = {
        itemId: editingPolicy.itemId,
        policyName: values.name,
        policyDescription:
          editingPolicy.policyDescription ?? "Generated from Rule Builder",
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

      try {
        const res = await updatePolicy(payload);
        if ((res as { isSuccess?: boolean })?.isSuccess) {
          showSuccessToast({ description: "Rule set updated successfully" });
          onCancel?.();
        } else {
          showErrorToast({ errors: (res as { errors?: unknown })?.errors });
        }
      } catch (error) {
        showErrorToast({ errors: error });
      }
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

      try {
        const res = await createPolicy(payload);

        if (res?.isSuccess) {
          showSuccessToast({ description: "Rule set saved successfully" });
          onCancel?.();
        } else {
          showErrorToast({ errors: res?.errors });
        }
      } catch (error) {
        showErrorToast({ errors: error });
      }
    }
  };

  const submitRuleSet = form.handleSubmit(onSubmit);

  return (
    <div className="w-full">
      <Form {...form}>
        <form
          onSubmit={(e) => {
            // Schema structure wraps the page in <form>; drawer portals can still leave edge cases
            // where submit bubbles or implicit submit targets the wrong form — keep policy saves isolated.
            e.preventDefault();
            e.stopPropagation();
            void submitRuleSet(e);
          }}
          className="space-y-4"
        >
          <div className="mt-6 border-t border-border/40" />
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

          <FormField
            control={form.control}
            name="logicalOperator"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Multi-rule relations</FormLabel>
                <FormControl>
                  <div
                    role="radiogroup"
                    aria-label="Multi-rule relations"
                    className="flex w-full items-center gap-1 rounded-md border border-border/40 bg-muted/20 p-1"
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

          <div className="flex flex-col">
            <div className="mt-4 rounded-sm border border-border/40 bg-muted/5 p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
                Rules
              </p>

              {fields.length === 0 ? (
                <div className="mt-3 flex flex-col justify-center gap-5">
                  <p className="text-center text-sm text-muted-foreground">
                    No rules added yet. Add a rule to define who can view.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex w-full items-center justify-center gap-2 border-dashed text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      append({
                        source: "",
                        field: "",
                        operator: "",
                        compareSource: "",
                        compareValue: "",
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Rule</span>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {fields.map((ruleField, index) => {
                      // Repeated between every pair of cards so the group's
                      // AND/OR mode — chosen once, above this list — stays
                      // visible while scanning past the third or fourth rule.
                      const logicalOperatorValue = form.watch("logicalOperator");
                      const source = form.watch(`rules.${index}.source`);
                      const leftField = form.watch(`rules.${index}.field`);
                      const operatorValue = form.watch(
                        `rules.${index}.operator`,
                      );
                      const compareSource = form.watch(
                        `rules.${index}.compareSource`,
                      );
                      const compareValue = form.watch(
                        `rules.${index}.compareValue`,
                      );
                      const fieldOptions = getFieldOptions(source);
                      const category = getLeftFieldCategory(source, leftField);
                      const filteredOperators = getFilteredOperators(
                        category,
                        source,
                        leftField,
                      );
                      const filteredCompareSourceOptions =
                        getFilteredCompareSourceOptions(category);
                      const compareFieldOptions = getRightFieldOptions(
                        compareSource,
                        category,
                      );
                      const isStaticValue =
                        source === RULE_SOURCE_TYPES.STATIC_VALUE;
                      const isNullOperator =
                        NULL_OPERATORS.includes(operatorValue);
                      const isCompareStatic =
                        compareSource === RULE_SOURCE_TYPES.STATIC_VALUE;
                      const isInOp = IN_OPERATORS.includes(operatorValue);
                      const isDirectValueOp = [
                        "REGEX",
                        "START_WITH",
                        "END_WITH",
                      ].includes(operatorValue);
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

                      return (
                        <Fragment key={ruleField.id}>
                          {index > 0 && (
                            <div className="flex items-center gap-2 px-1">
                              <div className="h-px flex-1 bg-border/40" aria-hidden />
                              <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {logicalOperatorValue || "AND"}
                              </span>
                              <div className="h-px flex-1 bg-border/40" aria-hidden />
                            </div>
                          )}
                          <Card className="flex flex-col gap-3 rounded-md border-border/50 p-4 shadow-none transition-colors hover:border-border">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                              Rule {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Remove rule"
                              onClick={() => remove(index)}
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </Button>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-3">
                            {/* Left Source + Left Field: a 2-up grid rather than a row that
                                only worked at the 85vw drawer width this form used to live in.
                                Every control below is a plain full-width grid item now. */}
                            <div className="grid grid-cols-2 gap-3">
                            {/* Left Source */}
                            <div>
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
                                    form.setValue(
                                      `rules.${index}.operator`,
                                      "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
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

                            {/* Left Field */}
                            <div>
                              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                {isStaticValue ? "Value" : "Field"}
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
                            </div>

                            {/* Operator + Compare Source: same 2-up grid, collapsing to one
                                column when Compare Source is hidden (IS_NULL / IS_NOT_NULL /
                                REGEX / START_WITH / END_WITH have no right-hand source). */}
                            <div
                              className={cn(
                                "grid gap-3",
                                isNullOperator || isDirectValueOp ? "grid-cols-1" : "grid-cols-2",
                              )}
                            >
                            {/* Operator */}
                            <div>
                              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                Operator
                              </span>
                            <FormField
                              control={form.control}
                              name={`rules.${index}.operator`}
                              render={({ field }) => (
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={(v) => {
                                    const wasContain = IN_OPERATORS.includes(
                                      field.value,
                                    );
                                    const willContain =
                                      IN_OPERATORS.includes(v);
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
                                      [
                                        "REGEX",
                                        "START_WITH",
                                        "END_WITH",
                                      ].includes(v)
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

                            {/* Compare Source (hidden for IS_NULL / IS_NOT_NULL / REGEX / START_WITH / END_WITH) */}
                            {!isNullOperator && !isDirectValueOp && (
                              <div>
                                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                  Compare with
                                </span>
                              <FormField
                                control={form.control}
                                name={`rules.${index}.compareSource`}
                                render={({ field }) => (
                                  <Select
                                    value={field.value || undefined}
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
                                      <SelectValue placeholder="Compare with" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {filteredCompareSourceOptions.map(
                                        (opt) => (
                                          <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                          >
                                            {opt.label}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              </div>
                            )}
                            </div>

                            {/* Compare Value: its own full-width row — none of its widgets
                                (multi-select popover, principal selector, plain input) read
                                well sharing a row at this width. */}
                            {!isNullOperator && (
                              <div>
                                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                                  Value
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
                                                                  (v) => v !== opt.value,
                                                                )
                                                              : [...selectedInValues, opt.value];
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
                          </Card>
                        </Fragment>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 flex w-full items-center justify-center gap-2 border-dashed text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      append({
                        source: "",
                        field: "",
                        operator: "",
                        compareSource: "",
                        compareValue: "",
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Rule</span>
                  </Button>
                </>
              )}
            </div>

            <div className="my-5 border-t border-border/40" />

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end sm:gap-5">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!form.formState.isValid || isSaving}
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
