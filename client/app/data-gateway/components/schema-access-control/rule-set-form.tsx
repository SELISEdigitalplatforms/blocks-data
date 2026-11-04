"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import {
  IN_OPERATORS,
  NULL_OPERATORS,
  POLICY_OPERATION,
  POLICY_TYPE,
  RULE_SOURCE_TYPES,
} from "@/data-gateway/constants/schema-access-control";
import { staticValueError, type StaticValueSpec } from "@/data-gateway/utils/rule-static-value";
import type { PresetRuleSet } from "@/data-gateway/utils/access-presets";
import type {
  ICreatePolicyPayload,
  IPolicyItem,
  IUpdatePolicyPayload,
} from "@/data-gateway/models/data-service";
import {
  createBlankGroup,
  createBlankRule,
  formGroupToPolicyGroup,
  policyGroupToFormGroup,
  type RuleGroupValues,
  type RuleSetFormValues,
} from "@/data-gateway/utils/schema-access-control.utils";
import { StatusSnackbar } from "../primitives";
import type { TransientStatus } from "@/data-gateway/hooks/use-transient-status";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ChevronLeft, Plus, SquarePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import {
  createRuleBuilderHelpers,
  useFocusNewRow,
  type RuleBuilderContext,
  type RuleCellKey,
  type SchemaField,
} from "./rule-condition-row";
import { RuleGroupChildren } from "./rule-group-editor";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_ACCESS_MODULE = "data.gateway.access";

/**
 * A group needs something inside it. The server evaluates an empty group to
 * false, so an AND parent holding one would deny everyone — better to refuse
 * it here than to save a rule set that quietly grants nothing.
 */
const groupHasContent = (group: { rules: unknown[]; nestedGroups: unknown[] }) =>
  group.rules.length + group.nestedGroups.length > 0;

const createLogicalOperatorSchema = () =>
  z.enum(["AND", "OR"], {
    required_error: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.PLEASE_SELECT_A_RULE_RELATION"),
  });

/**
 * The rule set's checks. A static value is also checked against the type of the property it is
 * compared with (a whole number for Int, true or false for Boolean, ...), so `valueSpecOf` gives the
 * left operand's value spec.
 */
const createRuleSetSchema = (valueSpecOf: (source: string, field: string) => StaticValueSpec) => {
  const logicalOperatorSchema = createLogicalOperatorSchema();
  const ruleRowSchema = z
    .object({
      source: z.string().min(1, tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.SOURCE_IS_REQUIRED")),
      field: z.string().min(1, tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.FIELD_IS_REQUIRED")),
      operator: z.string().min(1, tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.OPERATOR_IS_REQUIRED")),
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
            message: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.VALUE_IS_REQUIRED"),
            path: ["compareValue"],
          });
        }
        return;
      }

      if (!data.compareSource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.COMPARE_SOURCE_IS_REQUIRED"),
          path: ["compareSource"],
        });
      }
      if (!data.compareValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.COMPARE_VALUE_IS_REQUIRED"),
          path: ["compareValue"],
        });
        return;
      }
      if (data.compareSource === RULE_SOURCE_TYPES.STATIC_VALUE) {
        const message = staticValueError(
          valueSpecOf(data.source, data.field),
          data.compareValue,
          IN_OPERATORS.includes(data.operator),
        );
        if (message) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["compareValue"] });
        }
      }
    });

  const ruleGroupSchema: z.ZodType<RuleGroupValues, z.ZodTypeDef, unknown> = z
    .object({
      logicalOperator: logicalOperatorSchema,
      rules: z.array(ruleRowSchema),
      nestedGroups: z.array(z.lazy(() => ruleGroupSchema)),
    })
    .refine(groupHasContent, {
      message: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.A_GROUP_NEEDS_AT_LEAST_ONE"),
      path: ["rules"],
    });

  const ruleSetSchema = z
    .object({
      name: z.string().trim().min(1, tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.RULE_SET_NAME_IS_REQUIRED")),
      logicalOperator: logicalOperatorSchema,
      rules: z.array(ruleRowSchema),
      nestedGroups: z.array(ruleGroupSchema),
    })
    .refine(groupHasContent, {
      message: tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.AT_LEAST_ONE_COMPLETE_RULE_IS"),
      path: ["rules"],
    });

  return ruleSetSchema;
};

/** The verb shown under the title, e.g. "Order · Update". */
const OPERATION_LABEL: Record<number, string> = {
  get [POLICY_OPERATION.READ]() { return tStatic(DATA_GATEWAY_ACCESS_MODULE, "RULE_SET_FORM.READ"); },
  get [POLICY_OPERATION.CREATE]() { return tStatic(DATA_GATEWAY_ACCESS_MODULE, "common:CREATE"); },
  get [POLICY_OPERATION.UPDATE]() { return tStatic(DATA_GATEWAY_ACCESS_MODULE, "common:UPDATE"); },
  get [POLICY_OPERATION.DELETE]() { return tStatic(DATA_GATEWAY_ACCESS_MODULE, "common:DELETE"); },
  get [POLICY_OPERATION.ALL]() { return tStatic(DATA_GATEWAY_ACCESS_MODULE, "common:ALL"); },
};

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
  const { t, language } = useT(DATA_GATEWAY_ACCESS_MODULE);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const isEditMode = !!editingPolicy;

  /** The option lists and type rules every condition row picks from, root or nested. */
  const ruleBuilderHelpers = useMemo(
    () => createRuleBuilderHelpers(schemaFields, schemaName),
    [schemaFields, schemaName],
  );
  const ruleSetSchema = useMemo(
    // `language` rebuilds the schema so its messages follow the chosen language
    () => createRuleSetSchema(ruleBuilderHelpers.getStaticValueSpec),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleBuilderHelpers, language],
  );

  const form = useForm<RuleSetFormValues>({
    resolver: zodResolver(ruleSetSchema),
    mode: "onChange",
    defaultValues: {
      name: editingPolicy?.policyName ?? seed?.name ?? "",
      ...(editingPolicy
        ? policyGroupToFormGroup(editingPolicy.ruleGroup)
        : {
            logicalOperator: seed?.logicalOperator ?? "AND",
            rules: seed?.rules ?? [],
            nestedGroups: [],
          }),
    },
  });

  // A saved rule set can hold a value that no longer fits its property (its type changed, an Enum
  // value was removed). Check it on open so the row says why, instead of only greying out Save.
  useEffect(() => {
    if (editingPolicy) void form.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form opens
  }, []);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules",
  });
  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
  } = useFieldArray({
    control: form.control,
    name: "nestedGroups",
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

  /** One blank row. The literal was written out at both Add Rule triggers. */
  const addRule = () => append(createBlankRule());

  /** Condition row elements, keyed by their stable field id — see `useFocusNewRow`. */
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useFocusNewRow(fields, rowRefs);

  const ruleBuilderCtx: RuleBuilderContext = {
    ...ruleBuilderHelpers,
    projectKey,
    openCell,
    setOpenCellSynced,
    openCellRef,
    rowRefs,
  };

  const onSubmit = (values: RuleSetFormValues) => {
    const ruleGroup = formGroupToPolicyGroup(values);

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
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2.5 border-b border-border/40 pb-3.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("RULE_SET_FORM.BACK_TO_RULE_SETS")}
                className="h-7 w-7 shrink-0 text-muted-foreground"
                disabled={isSubmitting}
                onClick={onCancel}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {isEditMode ? t("RULE_SET_FORM.EDIT_RULE_SET") : t("RULE_SET_FORM.NEW_RULE_SET_FOR_CUSTOM_POLICY")}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {schemaName} · {OPERATION_LABEL[operation] ?? ""}
                </p>
              </div>
            </div>

            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                    {t("RULE_SET_FORM.RULE_SET_NAME")}
                  </FormLabel>
                  <FormControl>
                    <Input className="h-9" placeholder={t("RULE_SET_FORM.ENTER_A_RULE_NAME")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <section>
              <FormField
                control={form.control}
                name="logicalOperator"
                render={({ field }) => (
                  <FormItem className="mb-3 space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                        {t("RULE_SET_FORM.RULES")}
                      </span>
                      <FormControl>
                        <div
                          role="radiogroup"
                          aria-label={t("RULE_SET_FORM.MULTI_RULE_RELATIONS")}
                          className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background p-0.5"
                        >
                          {(
                            [
                              { value: "AND", label: t("RULE_SET_FORM.MATCH_ALL") },
                              { value: "OR", label: t("RULE_SET_FORM.MATCH_ANY") },
                            ] as const
                          ).map((option) => {
                            const isSelected = field.value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-label={option.label}
                                aria-checked={isSelected}
                                onClick={() => field.onChange(option.value)}
                                className={cn(
                                  "rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors",
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
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("RULE_SET_FORM.ADD_RULE")}
                        className="h-7 shrink-0 gap-1 px-2 text-xs font-semibold text-primary hover:text-primary"
                        onClick={addRule}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("RULE_SET_FORM.RULE")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("RULE_SET_FORM.ADD_GROUP")}
                        className="h-7 shrink-0 gap-1 px-2 text-xs font-semibold text-primary hover:text-primary"
                        onClick={() => appendGroup(createBlankGroup())}
                      >
                        <SquarePlus className="h-3.5 w-3.5" />
                        {t("RULE_SET_FORM.GROUP")}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {fields.length === 0 && groupFields.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("RULE_SET_FORM.NO_RULES_ADDED_YET_ADD_A")}
                </p>
              ) : (
                <RuleGroupChildren
                  path=""
                  depth={1}
                  ctx={ruleBuilderCtx}
                  ruleFields={fields}
                  groupFields={groupFields}
                  onRemoveRule={remove}
                  onRemoveGroup={removeGroup}
                />
              )}
            </section>
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
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {/* Sent the moment this is saved here — including the pending
                    access-level change first, if Custom was just picked — so
                    there's never a second, separate Save to remember. */}
                {isSubmitting ? t("RULE_SET_FORM.SAVING") : t("RULE_SET_FORM.SAVES_IMMEDIATELY")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={onCancel}
              >
                {t("common:CANCEL")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!form.formState.isValid || isSubmitting}
                onClick={() => void submitRuleSet()}
              >
                {t("RULE_SET_FORM.SAVE_RULE_SET")}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};
