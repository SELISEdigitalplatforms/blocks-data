"use client";

import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui-kits/drawer/drawer";
import { Input } from "@/components/ui-kits/input/input";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui-kits/tooltip/tooltip";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash, X } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import {
  useCreateSchemaFieldValidation,
  useDeleteSchemaFieldValidation,
  useGenerateRegex,
  useGetSchemaFieldValidation,
  useUpdateSchemaFieldValidation,
} from "../../hooks/use-configuration";
import {
  IFieldValidationRule,
  ISchemaFieldValidation,
} from "../../models/data-service";

interface SchemaFieldValidationDrawerProps {
  fieldName: string;
  schemaId: string;
  projectKey: string;
  initialValidationData?: IFieldValidationRule | null;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ValidationFormState {
  value: string;
  errorMessage: string;
  isActive: boolean;
  editingIndex?: number;
}

const defaultForm: ValidationFormState = {
  value: "",
  errorMessage: "",
  isActive: true,
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

export function SchemaFieldValidationDrawer({
  fieldName,
  schemaId,
  projectKey,
  initialValidationData,
  trigger,
  open,
  onOpenChange,
}: SchemaFieldValidationDrawerProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ValidationFormState>(defaultForm);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const originalForm = useRef<Pick<
    ValidationFormState,
    "value" | "errorMessage" | "isActive"
  > | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null,
  );
  const [shouldRefetch, setShouldRefetch] = useState(false);

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

  const resetForm = () => {
    setForm(defaultForm);
    setRegexError(null);
    setShowForm(false);
    setPrompt("");
  };

  const handleGenerateRegex = async () => {
    if (!prompt.trim()) {
      showErrorToast({ errors: ["Please enter a prompt"] });
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
        }));
        setRegexError(null);
        setPrompt("");
      } else {
        showErrorToast({ errors: ["Failed to generate regex"] });
      }
    } catch (error) {
      showErrorToast({ errors: ["Error generating regex"] });
    }
  };

  const handleEdit = (index: number) => {
    const v = validations[index];
    originalForm.current = {
      value: v.value,
      errorMessage: v.errorMessage,
      isActive: v.isActive,
    };
    setForm({
      value: v.value,
      errorMessage: v.errorMessage,
      isActive: v.isActive,
      editingIndex: index,
    });
    setRegexError(null);
    setShowForm(true);
  };

  const validateRegex = (pattern: string): boolean => {
    try {
      new RegExp(pattern);
      setRegexError(null);
      return true;
    } catch {
      setRegexError("Invalid regex pattern");
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!form.value.trim()) {
      setRegexError("Pattern is required");
      return;
    }
    if (!validateRegex(form.value)) return;

    const newRule: ISchemaFieldValidation = {
      type: 1,
      value: form.value.trim(),
      secondaryValue: "",
      errorMessage: form.errorMessage,
      isActive: form.isActive,
    };

    const res =
      form.editingIndex !== undefined && itemId
        ? await updateValidation({
            projectKey,
            itemId,
            schemaId,
            fieldName,
            validations: validations.map((v, i) =>
              i === form.editingIndex ? newRule : v,
            ),
          })
        : await createValidation({
            projectKey,
            schemaId,
            fieldName,
            // TODO: support multiple validations — use [...validations, newRule]
            validations: [newRule],
          });

    if (res.isSuccess) {
      showSuccessToast({
        description:
          form.editingIndex !== undefined
            ? "Validation updated successfully"
            : "Validation added successfully",
      });
      setShouldRefetch(true);
      resetForm();
    } else {
      showErrorToast({ errors: res.errors });
    }
  };

  const handleDelete = async (_index: number) => {
    // TODO: support multiple validations — filter by index and POST remaining via createValidation
    // const remaining = validations.filter((_, i) => i !== _index);
    // if (remaining.length > 0) {
    //   await createValidation({ projectKey, schemaId, fieldName, validations: remaining });
    //   return;
    // }

    if (!itemId) return;
    const res = await deleteValidation({
      id: itemId,
      projectKey,
      schemaId,
      fieldName,
    });
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
  const isEditMode = form.editingIndex !== undefined;
  const isDirty =
    !isEditMode ||
    !originalForm.current ||
    form.value.trim() !== originalForm.current.value.trim() ||
    form.errorMessage !== originalForm.current.errorMessage ||
    form.isActive !== originalForm.current.isActive;

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={onOpenChange}
      handleOnly
    >
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent className="inset-y-0 left-auto right-0 mt-0 flex h-full w-full flex-col gap-0 rounded-none border-l bg-background p-0 transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right md:w-1/2 [&>div:first-child]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DrawerTitle className="text-lg font-semibold leading-none tracking-tight">
            Validations for{" "}
            <span className="font-mono text-primary">{fieldName}</span>
          </DrawerTitle>
          <DrawerClose asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Close validation drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </DrawerClose>
        </div>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="flex flex-col gap-6 p-6">
            {/* Existing validations */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-medium-emphasis">
                Existing validations
              </p>

              {isRefreshing || (isLoading && !hasInitialData) ? (
                <ValidationSkeleton />
              ) : validations.length === 0 ? (
                <div className="flex items-center justify-center rounded-md border border-dashed py-8 text-sm text-muted-foreground">
                  No validations added yet
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {validations.map((validation, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="break-all font-mono text-sm text-foreground">
                          {validation.value}
                        </p>
                        {validation.errorMessage && (
                          <p className="text-xs text-muted-foreground">
                            {validation.errorMessage}
                          </p>
                        )}
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                            validation.isActive
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {validation.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={isPending}
                              onClick={() => handleEdit(index)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit validation</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled={isPending}
                              onClick={() => setPendingDeleteIndex(index)}
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete validation</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add / Edit form */}
            {showForm ? (
              <div className="flex flex-col gap-4 rounded-md border p-4">
                <p className="text-sm font-medium text-foreground">
                  {form.editingIndex !== undefined
                    ? "Edit validation"
                    : "Add validation"}
                </p>

                {/* Generate regex from prompt section */}
                <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-3">
                  <label className="text-xs text-muted-foreground">
                    Generate regex from prompt
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Generate a regex pattern to validate email addresses"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={isGenerating}
                      className="flex-1 h-10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateRegex}
                      disabled={isGenerating || !prompt.trim()}
                      className="h-10 px-4"
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provide a description to generate regex from AI
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Regex pattern <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="e.g. ^[a-zA-Z]+$"
                    value={form.value}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, value: e.target.value }));
                      if (regexError) validateRegex(e.target.value);
                    }}
                    className={`resize-none font-mono text-sm${regexError ? "border-destructive" : ""}`}
                    rows={4}
                  />
                  {regexError && (
                    <p className="text-xs text-destructive">{regexError}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Error message
                  </label>
                  <Input
                    placeholder="e.g. Only letters are allowed"
                    value={form.errorMessage}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        errorMessage: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        isActive: checked === true,
                      }))
                    }
                  />
                  <label
                    htmlFor="isActive"
                    className="cursor-pointer text-sm text-foreground"
                  >
                    Active
                  </label>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      isPending ||
                      !form.value.trim() ||
                      !!regexError ||
                      !isDirty
                    }
                    onClick={handleSubmit}
                  >
                    {isPending ? "Saving..." : isEditMode ? "Update" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={resetForm}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              // TODO: support multiple validations — remove the validations.length === 0 check
              !isRefreshing &&
              validations.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add validation
                </Button>
              )
            )}
          </div>
        </ScrollArea>
      </DrawerContent>

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
    </Drawer>
  );
}
