"use client";

import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui-kits/tooltip/tooltip";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Sparkles, Trash } from "lucide-react";
import { useState } from "react";
import {
  useCreateSchemaFieldValidation,
  useDeleteSchemaFieldValidation,
  useGenerateRegex,
  useGetSchemaFieldValidation,
  useUpdateSchemaFieldValidation,
} from "../../hooks/use-configuration";
import { useTransientStatus } from "../../hooks/use-transient-status";
import {
  IFieldValidationRule,
  ISchemaFieldValidation,
} from "../../models/data-service";
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

/** A new rule starts as a regex where one fits (the most common rule), otherwise as the first type offered. */
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
    <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
    </div>
  );
}

/**
 * The validations list, add/edit form and delete confirmation for one field.
 *
 * Shared by the docked inspector and the drawer that mobile and nested child
 * tables still use, so the two cannot drift — the same split already used for
 * access (`AccessInspectorPanel`).
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
  const [prompt, setPrompt] = useState("");
  // The rule as it was when editing started, for the dirty check.
  const [originalForm, setOriginalForm] = useState<RuleDraft | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null,
  );
  const [shouldRefetch, setShouldRefetch] = useState(false);
  // Add/update results show inline in the footer, right next to the button
  // that caused them, instead of a toast — the shared toast viewport docks
  // bottom-right, exactly where this panel's own footer sits. Delete goes
  // through its own confirmation dialog and keeps the toast, same as the
  // equivalent policy-delete flow in the access panel.
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

  const { mutateAsync: createValidation, isPending: isCreating } =
    useCreateSchemaFieldValidation();
  const { mutateAsync: updateValidation, isPending: isUpdating } =
    useUpdateSchemaFieldValidation();
  const { mutateAsync: deleteValidation, isPending: isDeleting } =
    useDeleteSchemaFieldValidation();
  const { mutateAsync: generateRegex, isPending: isGenerating } =
    useGenerateRegex();

  // Priority: fresh query result (post-mutation) → initial prop → query cache → null
  const freshQueryData =
    shouldRefetch && validationRes?.data !== undefined
      ? validationRes.data
      : undefined;
  const validationData =
    freshQueryData !== undefined
      ? freshQueryData
      : hasInitialData
        ? initialValidationData
        : (validationRes?.data ?? null);

  const validations: ISchemaFieldValidation[] =
    validationData?.validations ?? [];
  const itemId = validationData?.itemId ?? null;

  const isEditMode = form.editingIndex !== undefined;
  // A field holds at most one Reference rule; keep offering the type a rule being edited already has.
  const hasOtherReference = validations.some(
    (v, i) => v.type === VALIDATION_TYPE.Reference && i !== form.editingIndex,
  );
  const typeOptions = getAllowedValidationTypes(fieldType).filter(
    (t) => t !== VALIDATION_TYPE.Reference || !hasOtherReference,
  );
  if (isEditMode && !typeOptions.includes(form.type)) typeOptions.unshift(form.type);
  const draftError = checkRuleDraft(form, fieldType);

  const resetForm = () => {
    setForm(newDraft(fieldType));
    setShowDraftError(false);
    setShowForm(false);
    setPrompt("");
  };

  const openNewRule = () => {
    const draft = newDraft(fieldType);
    if (draft.type === VALIDATION_TYPE.Reference && hasOtherReference) draft.type = typeOptions[0];
    setForm(draft);
    setOriginalForm(null);
    setShowDraftError(false);
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
      const res = await generateRegex({
        description: prompt.trim(),
      });
      if (res.pattern) {
        setForm((prev) => ({
          ...prev,
          value: res.pattern,
          errorMessage: res.errorMessage || prev.errorMessage,
        }));
        setPrompt("");
      } else {
        setError(["Failed to generate regex"]);
      }
    } catch (error) {
      setError(["Error generating regex"]);
    }
  };

  const handleEdit = (index: number) => {
    const draft = draftFromRule(validations[index]);
    setOriginalForm(draft);
    setForm({ ...draft, editingIndex: index });
    setShowDraftError(false);
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
    const rules = isEditMode
      ? validations.map((v, i) => (i === form.editingIndex ? rule : v))
      : [...validations, rule];
    const res = await saveRules(rules);

    if (res.isSuccess) {
      setSuccess(isEditMode ? "Validation updated successfully" : "Validation added successfully");
      setShouldRefetch(true);
      resetForm();
    } else {
      setError(res.errors);
    }
  };

  const handleDelete = async (index: number) => {
    if (!itemId) return;
    const remaining = validations.filter((_, i) => i !== index);
    // The last rule takes the field's validation with it; otherwise the others stay.
    const res =
      remaining.length > 0
        ? await saveRules(remaining)
        : await deleteValidation({ id: itemId, projectKey, schemaId, fieldName });
    if (res.isSuccess) {
      showSuccessToast({ description: "Validation deleted successfully" });
      setShouldRefetch(true);
    } else {
      showErrorToast({ errors: res.errors });
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

  return (
    <>
      <ScrollArea className="relative flex-1 overflow-auto">
        <div className="flex flex-col gap-5 p-6">
          {/* Existing validations */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Existing validations
            </p>

            {isRefreshing || (isLoading && !hasInitialData) ? (
              <ValidationSkeleton />
            ) : validations.length === 0 ? (
              <div className="flex items-center justify-center rounded-sm border border-dashed border-border/60 bg-muted/10 py-8 text-xs text-muted-foreground">
                No validations added yet
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {validations.map((validation, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3 rounded-sm border border-border/40 bg-card px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {ruleTypeLabel(validation.type)}
                      </span>
                      <p
                        className={cn(
                          "break-all text-sm text-foreground",
                          validation.type === VALIDATION_TYPE.Regex && "font-mono",
                        )}
                      >
                        {formatRuleSummary(validation)}
                      </p>
                      {validation.errorMessage && (
                        <p className="text-xs text-muted-foreground">
                          {validation.errorMessage}
                        </p>
                      )}
                      <span className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                        validation.isActive
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border border-border/40",
                      )}>
                        {validation.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" disabled={isPending} onClick={() => handleEdit(index)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-500" disabled={isPending} onClick={() => setPendingDeleteIndex(index)}>
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add / Edit form */}
          {showForm ? (
            <div className="flex flex-col gap-4 rounded-sm border border-border/40 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {form.editingIndex !== undefined ? "Edit validation" : "Add validation"}
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Rule type
                </label>
                <Select
                  value={String(form.type)}
                  onValueChange={(value) =>
                    updateDraft({ type: Number(value) as ValidationTypeValue, value: "", secondaryValue: "" })
                  }
                >
                  <SelectTrigger className="h-9 w-full" aria-label="Rule type">
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

              {/* Generate regex from prompt */}
              {VALIDATION_TYPE_META[form.type]?.input === "regex" && (
              <div className="flex flex-col gap-2 rounded-sm border border-border/40 bg-indigo-500/5 p-3">
                <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Generate regex from prompt
                </label>
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="e.g. Generate a regex pattern to validate email addresses"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="h-9 w-full text-sm"
                  />
                  <Button
                    className={cn(
                      "h-9 w-full gap-1.5 text-xs shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)] transition-all bg-primary text-primary-foreground hover:bg-primary/90",
                      isGenerating &&
                        "animate-pulse shadow-[0_0_20px_-4px_rgba(99,102,241,0.6)]",
                    )}
                    onClick={handleGenerateRegex}
                    disabled={isGenerating || !prompt.trim()}
                  >
                    <Sparkles size={14} className={cn(isGenerating && "animate-spin")} />
                    {isGenerating ? "Generating…" : "Generate"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Provide a description to generate regex from AI
                </p>
              </div>
              )}

              <RuleValueInputs
                draft={form}
                fieldType={fieldType}
                enumValues={enumValues}
                projectKey={projectKey}
                error={showDraftError ? draftError : null}
                onChange={updateDraft}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Error message
                </label>
                <Input
                  placeholder="e.g. Only letters are allowed"
                  value={form.errorMessage}
                  onChange={(e) => setForm((prev) => ({ ...prev, errorMessage: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="isActive" checked={form.isActive} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked === true }))} />
                <label htmlFor="isActive" className="cursor-pointer text-xs text-muted-foreground">Active</label>
              </div>

            </div>
          ) : (
            !isRefreshing && (
              // `ghost` has no resting background or border of its own — only
              // its hover state — so paired with muted text it read as
              // disabled until the cursor found it. `outline` gives it a
              // resting shape, same as every other CTA in this shell.
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-border text-foreground hover:border-primary/40 hover:text-primary"
                onClick={openNewRule}
              >
                <Plus className="h-4 w-4" />
                Add validation
              </Button>
            )
          )}
        </div>
      </ScrollArea>

      {/* Actions, pinned below the scroll area rather than sitting at the end
          of the form inside it — the same treatment the rule editor's footer
          got, so both docked panels put Save in the same place instead of
          burying it under however much content the form happens to have.

          A sibling of the ScrollArea rather than `sticky` inside it: Radix
          wraps a viewport's children in a `display: table` element, which
          sticky does not position reliably against. Both hosts (the docked
          inspector's PanelShell and the drawer) are flex columns with this
          fragment's children as their own, so the row pins itself.

          Also holds the save/generate result, right above the button row —
          Add/Update closes the form the moment it succeeds, so this bar
          stays mounted a beat longer than the row it reported on rather than
          disappearing with it. */}
      {(status || showForm) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-card px-6 py-3">
          <StatusSnackbar status={status} />
          {showForm && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-muted-foreground">
                {isEditMode ? "Editing validation" : "New validation"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetForm}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending || !!draftError || !isDirty}
                onClick={handleSubmit}
              >
                {isPending ? "Saving…" : isEditMode ? "Update" : "Add"}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={pendingDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null);
        }}
      >
        <ConfirmationModal
          onCancel={() => setPendingDeleteIndex(null)}
          onConfirm={async () => {
            if (pendingDeleteIndex !== null) {
              await handleDelete(pendingDeleteIndex);
              setPendingDeleteIndex(null);
            }
          }}
          data={{
            dialogTitle: "Delete validation?",
            dialogSubtitle:
              "Are you sure you want to delete this validation? This action cannot be undone.",
            confirmButton: "Delete",
            cancelButton: "Cancel",
          }}
          buttonState={{ confirm: { disable: isDeleting } }}
        />
      </Dialog>
    </>
  );
}
