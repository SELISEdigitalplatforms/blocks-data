"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Switch } from "@/components/ui-kits/switch/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Sparkles, Trash, Wand } from "lucide-react";
import { useState } from "react";
import {
  useCreateSchemaFieldValidation,
  useDeleteSchemaFieldValidation,
  useGenerateRegex,
  useGetSchemaFieldValidation,
  useSchemaVariableContext,
  useUpdateSchemaFieldValidation,
} from "../../hooks/use-configuration";
import { useTransientStatus } from "../../hooks/use-transient-status";
import { IFieldValidationRule, ISchemaFieldValidation } from "../../models/data-service";
import {
  VALIDATION_TYPE,
  VALIDATION_TYPE_META,
  checkRuleDraft,
  draftFromRule,
  formatRuleSummary,
  getAllowedValidationTypes,
  ruleFromDraft,
  ruleTypeLabel,
  type RuleDraft,
  type ValidationTypeValue,
} from "../../utils/validation-rules.util";
import { StatusSnackbar } from "../primitives";
import { RuleValueInputs } from "./rule-value-inputs";

export interface SchemaFieldValidationPanelProps {
  fieldName: string;
  schemaId: string;
  projectKey: string;
  /** The property's type (String, Int, DateTime…): decides which rule types are offered. */
  fieldType: string;
  /** Allowed values when the property is an Enum. */
  enumValues?: string[];
  initialValidationData?: IFieldValidationRule | null;
}

interface ValidationFormState extends RuleDraft {
  editingIndex?: number;
}

const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground";
const HINT_CLASS = "text-[11px] leading-relaxed text-muted-foreground";
const CONTROL_CLASS = "h-9 rounded-md border-border/60 bg-background text-[12.5px]";
/** The kit's off state is a light grey made for light surfaces; on this dark panel it reads as "on". */
const SWITCH_OFF_CLASS = "data-[state=unchecked]:border-border data-[state=unchecked]:bg-muted";

/** A new rule starts as a pattern where one fits (the most common rule), otherwise as the first type offered. */
const newDraft = (fieldType: string): ValidationFormState => {
  const allowed = getAllowedValidationTypes(fieldType);
  return {
    type: allowed.includes(VALIDATION_TYPE.Regex) ? VALIDATION_TYPE.Regex : allowed[0],
    value: "",
    secondaryValue: "",
    errorMessage: "",
    isActive: true,
  };
};

function ValidationSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-background px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </div>
  );
}

/** How many validations there are and how many are on, e.g. "2 validations · 1 active, 1 off". */
function StatusLine({ rules, fieldName }: Readonly<{ rules: ISchemaFieldValidation[]; fieldName: string }>) {
  if (rules.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-background px-3 py-2.5 text-xs text-muted-foreground">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span>
          <strong className="font-semibold text-foreground/80">No validations.</strong> {fieldName} accepts any value of its type.
        </span>
      </div>
    );
  }
  const active = rules.filter((r) => r.isActive).length;
  const count = `${rules.length} ${rules.length === 1 ? "validation" : "validations"}`;
  let state = "all active";
  if (active === 0) state = "none active";
  else if (active < rules.length) state = `${active} active, ${rules.length - active} off`;
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs text-muted-foreground">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <span>
        <strong className="font-semibold text-foreground/80">{count}</strong> · {state}
      </span>
    </div>
  );
}

/** One saved rule: what it checks, the message it shows, and whether it is on. */
function RuleCard({
  rule,
  editing,
  confirming,
  busy,
  onToggle,
  onEdit,
  onAskDelete,
  onKeep,
  onDelete,
}: Readonly<{
  rule: ISchemaFieldValidation;
  editing: boolean;
  confirming: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
}>) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2.5",
        editing ? "border-primary/40" : "border-border/50",
        !rule.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-primary">
              {ruleTypeLabel(rule.type)}
            </span>
            <span className={cn("truncate text-[12.5px] text-foreground", rule.type === VALIDATION_TYPE.Regex && "font-mono")} title={formatRuleSummary(rule)}>
              {formatRuleSummary(rule)}
            </span>
          </div>
          {rule.errorMessage && <p className="mt-1 text-[11.5px] text-muted-foreground">“{rule.errorMessage}”</p>}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Switch
              size="sm"
              checked={rule.isActive}
              disabled={busy}
              onCheckedChange={onToggle}
              aria-label="Validation active"
              className={cn("mt-0.5 shrink-0", SWITCH_OFF_CLASS)}
            />
          </TooltipTrigger>
          <TooltipContent>{rule.isActive ? "Active — switch off to keep the validation without enforcing it" : "Inactive — switch on to enforce it"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" disabled={busy} onClick={onEdit} aria-label="Edit validation">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-rose-500" disabled={busy} onClick={onAskDelete} aria-label="Delete validation">
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Delete this validation?" className="mt-2.5 flex items-center gap-2 border-t border-border/50 pt-2.5 text-[11.5px] text-foreground/80">
          <span className="flex-1">Delete this validation? Records already stored are not re-checked.</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={busy} onClick={onKeep}>
            Keep
          </Button>
          <Button type="button" size="sm" className="h-7 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The validation rules of one field: the list, the add/edit form and the delete confirmation.
 *
 * Shared by the docked inspector and the drawer that mobile and nested child
 * tables still use, so the two cannot drift — the same split already used for
 * access (`AccessInspectorPanel`). Laid out like the default-value panel: a
 * status line, the content, a pinned footer.
 */
export function SchemaFieldValidationPanel({
  fieldName,
  schemaId,
  projectKey,
  fieldType,
  enumValues = [],
  initialValidationData,
}: SchemaFieldValidationPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ValidationFormState>(() => newDraft(fieldType));
  // Shown once the user has typed or tried to save, not while the form is still blank.
  const [showDraftError, setShowDraftError] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [prompt, setPrompt] = useState("");
  // The rule as it was when editing started, for the dirty check.
  const [originalForm, setOriginalForm] = useState<RuleDraft | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [shouldRefetch, setShouldRefetch] = useState(false);
  // Every result shows inline in the footer, next to the buttons that caused
  // it, instead of a toast — the shared toast viewport docks bottom-right,
  // exactly where this panel's own footer sits.
  const { status, setSuccess, setError } = useTransientStatus();

  // When the prop is provided (even as null) we already have data from the schema response
  // and can skip the initial GET. After any mutation we flip shouldRefetch to fetch fresh data.
  const hasInitialData = initialValidationData !== undefined;

  const {
    data: validationRes,
    isLoading,
    isFetching,
  } = useGetSchemaFieldValidation({
    schemaId,
    fieldName,
    projectKey,
    enabled: !hasInitialData || shouldRefetch,
  });

  const { mutateAsync: createValidation, isPending: isCreating } = useCreateSchemaFieldValidation();
  const { mutateAsync: updateValidation, isPending: isUpdating } = useUpdateSchemaFieldValidation();
  const { mutateAsync: deleteValidation, isPending: isDeleting } = useDeleteSchemaFieldValidation();
  const { mutateAsync: generateRegex, isPending: isGenerating } = useGenerateRegex();
  // Comparison values may name another property of the same record, e.g. {{Employee.StartDate}}.
  const variables = useSchemaVariableContext(schemaId, projectKey);

  // Priority: fresh query result (post-mutation) → initial prop → query cache → null
  const freshQueryData = shouldRefetch && validationRes?.data !== undefined ? validationRes.data : undefined;
  const validationData =
    freshQueryData !== undefined ? freshQueryData : hasInitialData ? initialValidationData : (validationRes?.data ?? null);

  const validations: ISchemaFieldValidation[] = validationData?.validations ?? [];
  const itemId = validationData?.itemId ?? null;

  const isEditMode = form.editingIndex !== undefined;
  // A field holds at most one Reference rule; keep offering the type a rule being edited already has.
  const hasOtherReference = validations.some((v, i) => v.type === VALIDATION_TYPE.Reference && i !== form.editingIndex);
  const typeOptions = getAllowedValidationTypes(fieldType).filter((t) => t !== VALIDATION_TYPE.Reference || !hasOtherReference);
  if (isEditMode && !typeOptions.includes(form.type)) typeOptions.unshift(form.type);
  const draftError = checkRuleDraft(form, fieldType, variables);

  const resetForm = () => {
    setForm(newDraft(fieldType));
    setShowDraftError(false);
    setShowForm(false);
    setShowGenerator(false);
    setPrompt("");
  };

  const openNewRule = () => {
    const draft = newDraft(fieldType);
    if (draft.type === VALIDATION_TYPE.Reference && hasOtherReference) draft.type = typeOptions[0];
    setForm(draft);
    setOriginalForm(null);
    setShowDraftError(false);
    setPendingDeleteIndex(null);
    setShowForm(true);
  };

  const updateDraft = (patch: Partial<RuleDraft>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setShowDraftError(true);
  };

  const handleGenerateRegex = async () => {
    if (!prompt.trim()) {
      setError(["Please enter a prompt"]);
      return;
    }
    try {
      const res = await generateRegex({ description: prompt.trim() });
      if (res.pattern) {
        setForm((prev) => ({ ...prev, value: res.pattern, errorMessage: res.errorMessage || prev.errorMessage }));
        setPrompt("");
      } else {
        setError(["Failed to generate regex"]);
      }
    } catch {
      setError(["Error generating regex"]);
    }
  };

  const handleEdit = (index: number) => {
    const draft = draftFromRule(validations[index]);
    setOriginalForm(draft);
    setForm({ ...draft, editingIndex: index });
    setShowDraftError(false);
    setPendingDeleteIndex(null);
    setShowForm(true);
  };

  /** Saves the whole list: POST creates the field's validation, PUT replaces its rules. */
  const saveRules = (rules: ISchemaFieldValidation[]) =>
    itemId
      ? updateValidation({ projectKey, itemId, schemaId, fieldName, validations: rules })
      : createValidation({ projectKey, schemaId, fieldName, validations: rules });

  const handleSubmit = async () => {
    if (draftError) {
      setShowDraftError(true);
      return;
    }
    const rule = ruleFromDraft(form, fieldType);
    const rules = isEditMode ? validations.map((v, i) => (i === form.editingIndex ? rule : v)) : [...validations, rule];
    const res = await saveRules(rules);
    if (res.isSuccess) {
      setSuccess(isEditMode ? "Validation updated" : "Validation added");
      setShouldRefetch(true);
      resetForm();
    } else {
      setError(res.errors);
    }
  };

  /** Switches one rule on or off in place; the rest of the list is sent back as it was. */
  const handleToggle = async (index: number) => {
    const rules = validations.map((v, i) => (i === index ? { ...v, isActive: !v.isActive } : v));
    const res = await saveRules(rules);
    if (res.isSuccess) {
      setSuccess(rules[index].isActive ? "Validation switched on" : "Validation switched off");
      setShouldRefetch(true);
    } else {
      setError(res.errors);
    }
  };

  const handleDelete = async (index: number) => {
    if (!itemId) return;
    const remaining = validations.filter((_, i) => i !== index);
    // The last rule takes the field's validation with it; otherwise the others stay.
    const res = remaining.length > 0 ? await saveRules(remaining) : await deleteValidation({ id: itemId, projectKey, schemaId, fieldName });
    if (res.isSuccess) {
      setSuccess("Validation deleted");
      setShouldRefetch(true);
      if (form.editingIndex === index) resetForm();
    } else {
      setError(res.errors);
    }
  };

  const isPending = isCreating || isUpdating || isDeleting;
  // Show skeleton while a mutation is in flight OR while the post-mutation refetch is resolving
  const isRefreshing = isPending || (shouldRefetch && isFetching);
  const isDirty =
    !isEditMode ||
    !originalForm ||
    form.type !== originalForm.type ||
    form.value.trim() !== originalForm.value.trim() ||
    form.secondaryValue.trim() !== originalForm.secondaryValue.trim() ||
    form.errorMessage !== originalForm.errorMessage ||
    form.isActive !== originalForm.isActive;
  const isRegex = VALIDATION_TYPE_META[form.type]?.input === "regex";

  const showList = !(isRefreshing || (isLoading && !hasInitialData));

  return (
    <>
      <ScrollArea className="relative flex-1 overflow-auto">
        <div className="flex flex-col gap-[18px] p-4">
          <StatusLine rules={validations} fieldName={fieldName} />

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className={LABEL_CLASS}>Validations</span>
              <span className="text-[10.5px] text-muted-foreground">checked on insert and update</span>
            </div>

            {showList ? (
              <div className="flex flex-col gap-1.5">
                {validations.map((validation, index) => (
                  <RuleCard
                    // Rules have no id of their own; the list is replaced whole on every save.
                    key={`${index}-${validation.type}-${String(validation.value)}`}
                    rule={validation}
                    editing={form.editingIndex === index && showForm}
                    confirming={pendingDeleteIndex === index}
                    busy={isPending}
                    onToggle={() => void handleToggle(index)}
                    onEdit={() => handleEdit(index)}
                    onAskDelete={() => setPendingDeleteIndex(index)}
                    onKeep={() => setPendingDeleteIndex(null)}
                    onDelete={async () => {
                      await handleDelete(index);
                      setPendingDeleteIndex(null);
                    }}
                  />
                ))}
                {!showForm && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-[34px] w-full gap-1.5 border-dashed border-border/70 bg-transparent text-xs font-semibold text-foreground/80 hover:border-primary/40 hover:text-primary"
                    onClick={openNewRule}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add validation
                  </Button>
                )}
              </div>
            ) : (
              <ValidationSkeleton />
            )}
          </div>

          {showForm && (
            <div className="flex flex-col gap-3.5 rounded-md border border-primary/30 bg-primary/[0.04] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-primary">{isEditMode ? "Edit validation" : "New validation"}</p>

              <div className="flex flex-col gap-1.5">
                <label className={LABEL_CLASS}>Validation type</label>
                <Select
                  value={String(form.type)}
                  onValueChange={(value) => {
                    updateDraft({ type: Number(value) as ValidationTypeValue, value: "", secondaryValue: "" });
                    setShowDraftError(false);
                  }}
                >
                  <SelectTrigger className={cn(CONTROL_CLASS, "w-full")} aria-label="Validation type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={String(type)}>
                        {VALIDATION_TYPE_META[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <RuleValueInputs
                // Fresh fixed/property switches per rule being edited.
                key={form.editingIndex ?? "new"}
                draft={form}
                fieldType={fieldType}
                enumValues={enumValues}
                projectKey={projectKey}
                variables={variables}
                fieldName={fieldName}
                error={showDraftError ? draftError : null}
                patternAction={
                  isRegex ? (
                    <button
                      type="button"
                      onClick={() => setShowGenerator((v) => !v)}
                      aria-expanded={showGenerator}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <Wand className="h-3 w-3" aria-hidden />
                      Generate from a description
                    </button>
                  ) : null
                }
                onChange={updateDraft}
              />

              {isRegex && showGenerator && (
                <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background p-3">
                  <label htmlFor="regex-prompt" className={LABEL_CLASS}>
                    Describe what the value should look like
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="regex-prompt"
                      placeholder="e.g. Generate a regex pattern to validate email addresses"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={isGenerating}
                      className={cn(CONTROL_CLASS, "flex-1")}
                    />
                    <Button type="button" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => void handleGenerateRegex()} disabled={isGenerating || !prompt.trim()}>
                      <Sparkles size={13} className={cn(isGenerating && "animate-spin")} />
                      {isGenerating ? "Generating…" : "Generate"}
                    </Button>
                  </div>
                  <p className={HINT_CLASS}>The pattern is written for you; check it before saving.</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="rule-message" className={LABEL_CLASS}>
                  Message shown when it fails
                </label>
                <Input
                  id="rule-message"
                  placeholder="e.g. Only letters are allowed"
                  value={form.errorMessage}
                  onChange={(e) => setForm((prev) => ({ ...prev, errorMessage: e.target.value }))}
                  className={CONTROL_CLASS}
                />
              </div>

              <div className="flex items-center gap-2.5">
                <Switch
                  id="rule-active"
                  size="sm"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked === true }))}
                  aria-label="Validation active"
                  className={SWITCH_OFF_CLASS}
                />
                <label htmlFor="rule-active" className="cursor-pointer text-xs text-foreground/80">
                  {form.isActive ? "Active — enforced on insert and update" : "Inactive — kept, not enforced"}
                </label>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Actions, pinned below the scroll area rather than at the end of the
          form inside it, so Add sits in the same place however much content
          the form has. A sibling of the ScrollArea rather than `sticky` inside
          it: Radix wraps a viewport's children in a `display: table` element,
          which sticky does not position reliably against. Also holds the
          result of a save, toggle or delete, so it outlives the row it
          reported on. */}
      {(status || showForm) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-card px-4 py-3">
          <StatusSnackbar status={status} />
          {showForm && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-muted-foreground">{isEditMode ? "Editing a validation" : "New validation"}</span>
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={resetForm} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={isPending || !!draftError || !isDirty} onClick={() => void handleSubmit()}>
                {isPending ? "Saving…" : isEditMode ? "Save validation" : "Add validation"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
