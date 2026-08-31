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
import { Label } from "@/components/ui-kits/label/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui-kits/popover/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui-kits/radio-group/radio-group";
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
import { Plus, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { SchemaAccessControlAccordion } from "./schema-access-control-accordion";

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
}

interface RuleSetFormProps {
  onCancel?: () => void;
  schemaFields?: SchemaField[];
  schemaName: string;
  schemaId: string;
  operation: number;
  fieldNames: string[];
  editingPolicy?: IPolicyItem;
  level: "row" | "column";
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
      name: editingPolicy?.policyName ?? "",
      logicalOperator: editingPolicy
        ? editingPolicy.ruleGroup.logicalOperator === LOGICAL_OPERATOR.OR
          ? "OR"
          : "AND"
        : "AND",
      rules: editingPolicy
        ? editingPolicy.ruleGroup.rules.map(policyRuleToFormRow)
        : [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules",
  });

  const getFieldOptions = (source: string) => {
    if (source === RULE_SOURCE_TYPES.AUTH) return AUTH_FIELD_OPTIONS;
    if (source === RULE_SOURCE_TYPES.SCHEMA_FIELD)
      return schemaFields.map((f) => ({ label: f.name, value: f.name }));
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
      const sf = schemaFields.find((f) => f.name === fieldName);
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

  /** Filter compare source options by category */
  const getFilteredCompareSourceOptions = (
    category: FieldTypeCategory | undefined,
  ) => {
    if (!category) return COMPARE_SOURCE_OPTIONS;
    // Numeric: no auth fields are numeric, so remove Auth
    if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
      return COMPARE_SOURCE_OPTIONS.filter(
        (o) => o.value !== RULE_SOURCE_TYPES.AUTH,
      );
    }
    return COMPARE_SOURCE_OPTIONS;
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
      if (!category)
        return schemaFields.map((f) => ({ label: f.name, value: f.name }));
      return schemaFields
        .filter((f) => {
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
              getFieldTypeCategory(f.type, false) ===
              FIELD_TYPE_CATEGORY.STRING
            );
          }
          if (category === FIELD_TYPE_CATEGORY.NUMERIC) {
            return (
              getFieldTypeCategory(f.type, false) ===
              FIELD_TYPE_CATEGORY.NUMERIC
            );
          }
          return true;
        })
        .map((f) => ({ label: f.name, value: f.name }));
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
          <hr className="mt-6" />
          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Rule Set Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Enter a rule name" {...field} />
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
                  <RadioGroup
                    {...field}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-x-10 sm:gap-y-1"
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <Label className="flex cursor-pointer items-center gap-2">
                      <RadioGroupItem value="AND" />
                      All the following rules match
                    </Label>

                    <Label className="flex cursor-pointer items-center gap-2">
                      <RadioGroupItem value="OR" />
                      Any of the following rules match
                    </Label>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col">
            <div className="mt-4 rounded-[4px] border border-[#7B7B7B] p-4 dark:border-icon-warning dark:bg-warning-800/20">
              <p className="mb-3 font-medium">Rules</p>

              {fields.length === 0 ? (
                <div className="mt-3 flex flex-col justify-center gap-5">
                  <p className="text-center text-sm text-muted-foreground">
                    No rules added yet. Add a rule to define who can view.
                  </p>
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex items-center gap-2"
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
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4">
                    {fields.map((ruleField, index) => {
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
                        <Card
                          key={ruleField.id}
                          className={cn(
                            "relative isolate my-1 flex flex-col p-4 shadow-none",
                            "lg:flex-row lg:items-start lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
                          )}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-3 max-lg:pt-8 lg:flex-row lg:items-start lg:gap-2 lg:pt-0">
                            {/* Left Source */}
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
                                  <SelectTrigger className="h-10 w-full min-w-0 lg:flex-1">
                                    <SelectValue placeholder="Select source" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RULE_SOURCE_OPTIONS.map((opt) => (
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

                            {/* Left Field */}
                            <FormField
                              control={form.control}
                              name={`rules.${index}.field`}
                              render={({ field }) =>
                                isStaticValue ? (
                                  <Input
                                    className="h-10 w-full min-w-0 lg:flex-1"
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
                                    <SelectTrigger className="h-10 w-full min-w-0 lg:flex-1">
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

                            {/* Operator */}
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
                                  <SelectTrigger className="h-10 w-full min-w-0 lg:flex-1">
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

                            {/* Compare Source (hidden for IS_NULL / IS_NOT_NULL / REGEX / START_WITH / END_WITH) */}
                            {!isNullOperator && !isDirectValueOp && (
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
                                    <SelectTrigger className="h-10 w-full min-w-0 lg:flex-1">
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
                            )}

                            {/* Compare Value (hidden for IS_NULL / IS_NOT_NULL) */}
                            {!isNullOperator && (
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
                                        className="h-10 w-full min-w-0 lg:flex-1"
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
                                        className="h-10 w-full min-w-0 lg:flex-1"
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
                                            className="flex h-10 w-full min-w-0 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground lg:flex-1"
                                          >
                                            <span className="truncate text-left">
                                              {selectedInValues.length > 0
                                                ? selectedInValues.join(", ")
                                                : "Select fields"}
                                            </span>
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              width="12"
                                              height="12"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              className="ml-2 shrink-0 opacity-50"
                                            >
                                              <path d="m6 9 6 6 6-6" />
                                            </svg>
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
                                      className="h-10 w-full min-w-0 lg:flex-1"
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
                                      <SelectTrigger className="h-10 w-full min-w-0 lg:flex-1">
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
                            )}
                          </div>

                          <div className="absolute right-0 top-0 z-20 -translate-y-1/2 translate-x-1/2 lg:static lg:shrink-0 lg:translate-x-0 lg:translate-y-0 lg:self-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full border border-border bg-background text-destructive shadow-md ring-1 ring-background hover:bg-destructive/10 hover:text-destructive dark:bg-card"
                              aria-label="Remove rule"
                              onClick={() => remove(index)}
                            >
                              <X className="h-4 w-4" strokeWidth={2.25} />
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex items-center gap-2"
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
                </>
              )}
            </div>

            {/*Rules populated Accordion */}
            <SchemaAccessControlAccordion isEditing />

            <hr className="my-5" />

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end sm:gap-5">
              {/* <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex items-center gap-2 text-red-500 hover:text-red-500"
              >
                <Trash className="h-4 w-4" />
                Delete Role Set
              </Button> */}

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
