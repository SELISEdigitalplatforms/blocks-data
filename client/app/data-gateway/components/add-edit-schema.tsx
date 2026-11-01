import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { Label } from "@/components/ui-kits/label/label";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { showErrorToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { AlertCircle, Pencil, Plus } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  useGetDataServiceConfiguration,
  useSchemaList,
} from "../hooks/use-configuration";
import {
  ICreateSchemaDefaultValues,
  IDataSourceResponse,
  ISchemaDetails,
} from "../models/data-service";
import {
  allowLettersNumbersUnderscoreKeyDown,
  SCHEMA_NAME_ALLOWED_PATTERN,
} from "../utils/input-restriction.util";
import { useT } from "@seliseblocks/genesis-os/i18n";

const COMMON_CANCEL = "common:CANCEL";

type SchemaFormValues = {
  schemaName: string;
  schemaType: "Entity" | "DTO";
  entityName?: string;
  description?: string;
};

/** A schema's description: plain text, at most this many characters (server `SchemaDescription.MaxLength`). */
export const SCHEMA_DESCRIPTION_MAX_LENGTH = 500;

type SchemaModalProps = {
  mode: "add" | "edit";
  defaultValues?: ICreateSchemaDefaultValues;
  onCancel: () => void;
  onSubmit: (values: ICreateSchemaDefaultValues) => Promise<boolean>;
};

export const AddEditSchemaModal: React.FC<SchemaModalProps> = ({
  mode,
  defaultValues,
  onCancel,
  onSubmit,
}) => {
  const { t } = useT("data.gateway.schema");
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<SchemaFormValues>({
    mode: "onChange",
    defaultValues: {
      schemaName: "",
      schemaType: "Entity",
      entityName: "",
      description: "",
    },
  });

  const [pendingFormData, setPendingFormData] =
    useState<SchemaFormValues | null>(null);
  const [isEditConfirmationModalOpen, setIsEditConfirmationModalOpen] =
    useState(false);
  const editSchemaConfirmationModalData = {
    dialogTitle: t("ADD_EDIT_SCHEMA.UPDATE_SCHEMA_PROPERTY"),
    dialogSubtitle:
      t("ADD_EDIT_SCHEMA.UPDATING_THE_SCHEMA_PROPERTIES_WILL"),
    confirmButton: t("common:UPDATE"),
    cancelButton: t(COMMON_CANCEL),
  };

  const schemaType = watch("schemaType");
  const schemaName = watch("schemaName");
  const isEntity = schemaType === "Entity";

  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  // Fetch data source configuration for collection name pattern
  const { data: configData } = useGetDataServiceConfiguration({ enabled: isEntity });
  const config = configData?.data as IDataSourceResponse | undefined;
  const isCollectionNameEditable = config?.isCollectionNameEditable ?? false;
  const collectionNamePattern =
    config?.collectionNamePattern ?? "sb_{SchemaName}s";

  // Call API to check schema name existence
  const { data: schemaListQuery } = useSchemaList({
    schemaName: schemaName.trim() || "",
    projectKey: projectKey,
    pageNo: 1,
    pageSize: 100,
  });

  useEffect(() => {
    // Edit mode always has a subject to prefill from. Add mode usually
    // starts blank, but a caller can still hand it a starting kind — the
    // Entity/Child cards on the empty-canvas do, so picking one jumps
    // straight to that type instead of always landing on Entity.
    if (defaultValues) {
      reset({
        schemaName: defaultValues.schemaName,
        schemaType: defaultValues.schemaType,
        entityName: defaultValues.entityName ?? "",
        description: defaultValues.description ?? "",
      });
    } else {
      reset({
        schemaName: "",
        schemaType: "Entity",
        entityName: "",
        description: "",
      });
    }
  }, [mode, defaultValues, reset]);

  useMemo(() => {
    if (!schemaName.trim()) {
      clearErrors("schemaName");
      return;
    }

    // Check if schemaName exists in the returned list (case-insensitive)
    const exists = schemaListQuery?.data?.items?.some(
      (schema: ISchemaDetails) =>
        schema.schemaName.toLowerCase() === schemaName.toLowerCase(),
    );

    setTimeout(() => {
      if (exists) {
        setError("schemaName", {
          type: "manual",
          message: t("ADD_EDIT_SCHEMA.SCHEMA_WITH_THIS_NAME_ALREADY_EXISTS"),
        });
      } else {
        clearErrors("schemaName");
      }
    }, 0);
  }, [schemaName, schemaListQuery, setError, clearErrors, t]);

  const onFormSubmit = async (data: SchemaFormValues) => {
    if (mode === "edit") {
      setPendingFormData(data);
      setIsEditConfirmationModalOpen(true);
    } else {
      const success = await onSubmit(data);
      if (success) {
        resetForm();
      }
    }
  };

  const resetForm = () => {
    reset({
      schemaName: "",
      schemaType: "Entity",
      entityName: "",
    });
  };

  const handleEditConfirm = async () => {
    if (!pendingFormData) {
      setIsEditConfirmationModalOpen(false);
      return;
    }
    try {
      const success = await onSubmit(pendingFormData);
      if (success) {
        resetForm();
        setPendingFormData(null);
      }
    } catch (error) {
      console.error("Error creating schema:", error);
      showErrorToast({
        errors: [t("ADD_EDIT_SCHEMA.AN_UNEXPECTED_ERROR_OCCURRED_PLEASE")],
      });
    } finally {
      setIsEditConfirmationModalOpen(false);
    }
  };

  return (
    <>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "edit" ? (
              <Pencil className="h-4 w-4 text-indigo-400" />
            ) : (
              <Plus className="h-4 w-4 text-indigo-400" />
            )}
            {mode === "edit" ? t("ADD_EDIT_SCHEMA.EDIT_SCHEMA") : t("ADD_EDIT_SCHEMA.ADD_NEW_SCHEMA")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("ADD_EDIT_SCHEMA.DEFINE_A_SCHEMA_TO_STRUCTURE_YOUR")}
          </p>
          {mode === "edit" && (
            <div className="mb-4 rounded-md border border-base-warning bg-warning-100 p-4 dark:border-icon-warning dark:bg-warning-800/20">
              <div className="flex items-start gap-2 text-warning-700 dark:text-icon-warning">
                <p className="text-sm">
                  {t("ADD_EDIT_SCHEMA.EDITING_SCHEMA_PROPERTIES_WILL_IMPACT")}
                </p>
              </div>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="space-y-4 py-2">
            {/* Schema Name */}
            <div>
              <label
                htmlFor="schemaName"
                className="text-sm font-medium text-medium-emphasis"
              >
                {t("ADD_EDIT_SCHEMA.SCHEMA_NAME")}
              </label>
              <Input
                id="schemaName"
                type="text"
                placeholder={t("ADD_EDIT_SCHEMA.ENTER_SCHEMA_NAME")}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                {...register("schemaName", {
                  required: t("ADD_EDIT_SCHEMA.SCHEMA_NAME_IS_REQUIRED"),
                  pattern: {
                    value: SCHEMA_NAME_ALLOWED_PATTERN,
                    message:
                      t("ADD_EDIT_SCHEMA.ONLY_LETTERS_NUMBERS_AND_ARE_ALLOWED"),
                  },
                  onChange: (e) => {
                    const sanitized = e.target.value
                      .replace(/[^A-Za-z0-9_]/g, "")
                      .replace(/^[0-9]+/, "");
                    if (sanitized !== e.target.value) {
                      e.target.value = sanitized;
                    }
                    if (mode === "add") {
                      const pattern = collectionNamePattern.replace(
                        "{SchemaName}",
                        sanitized,
                      );
                      setValue("entityName", pattern);
                    }
                  },
                })}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  const sanitized = pasted.replace(/[^A-Za-z0-9_]/g, "");
                  if (sanitized !== pasted) {
                    e.preventDefault();
                    const target = e.target as HTMLInputElement;
                    const newValue =
                      target.value.slice(
                        0,
                        target.selectionStart ?? target.value.length,
                      ) +
                      sanitized +
                      target.value.slice(
                        target.selectionEnd ?? target.value.length,
                      );
                    setValue("schemaName", newValue, { shouldValidate: true });
                  }
                }}
                onKeyDown={allowLettersNumbersUnderscoreKeyDown}
              />

              {errors.schemaName && (
                <p className="mt-1 text-sm text-red-500">
                  {errors?.schemaName?.message}
                </p>
              )}
            </div>

            {/* Schema Type */}
            <div>
              <Select
                value={watch("schemaType")}
                onValueChange={(value) =>
                  setValue("schemaType", value as "Entity" | "DTO")
                }
              >
                <Label htmlFor="schemaType" className="text-medium-emphasis">
                  {t("ADD_EDIT_SCHEMA.SCHEMA_TYPE")}
                </Label>
                <SelectTrigger id="schemaType">
                  <SelectValue placeholder={t("ADD_EDIT_SCHEMA.SELECT_SCHEMA_TYPE")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entity">{t("ADD_EDIT_SCHEMA.ENTITY")}</SelectItem>
                  <SelectItem value="DTO">{t("ADD_EDIT_SCHEMA.CHILD")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Entity Name (conditional) */}
            {isEntity && (
              <div>
                <label
                  htmlFor="entityName"
                  className="text-sm font-medium text-medium-emphasis"
                >
                  {t("ADD_EDIT_SCHEMA.ENTITY_NAME")}
                </label>
                <Input
                  id="entityName"
                  type="text"
                  placeholder={t("ADD_EDIT_SCHEMA.ENTER_ENTITY_NAME")}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  {...register("entityName", {
                    required: t("ADD_EDIT_SCHEMA.ENTITY_NAME_IS_REQUIRED"),
                    pattern: {
                      value: SCHEMA_NAME_ALLOWED_PATTERN,
                      message:
                        t("ADD_EDIT_SCHEMA.ONLY_LETTERS_NUMBERS_AND_ARE_ALLOWED"),
                    },
                    onChange: (e) => {
                      const sanitized = e.target.value
                        .replace(/[^A-Za-z0-9_]/g, "")
                        .replace(/^[0-9]+/, "");
                      if (sanitized !== e.target.value) {
                        e.target.value = sanitized;
                      }
                    },
                  })}
                  onPaste={(e) => {
                    if (!isCollectionNameEditable) return;
                    const pasted = e.clipboardData.getData("text");
                    const sanitized = pasted
                      .replace(/[^A-Za-z0-9_]/g, "")
                      .replace(/^[0-9]+/, "");
                    if (sanitized !== pasted) {
                      e.preventDefault();
                      const target = e.target as HTMLInputElement;
                      const newValue =
                        target.value.slice(
                          0,
                          target.selectionStart ?? target.value.length,
                        ) +
                        sanitized +
                        target.value.slice(
                          target.selectionEnd ?? target.value.length,
                        );
                      setValue("entityName", newValue, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  onKeyDown={
                    isCollectionNameEditable
                      ? allowLettersNumbersUnderscoreKeyDown
                      : undefined
                  }
                  readOnly={!isCollectionNameEditable}
                />
                {errors.entityName && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.entityName.message}
                  </p>
                )}
              </div>
            )}
            {/* Description (section 7): shown under the name, and in the target picker. */}
            <div>
              <label htmlFor="schemaDescription" className="text-sm font-medium text-medium-emphasis">
                {t("common:DESCRIPTION")} <span className="font-normal text-muted-foreground">{t("ADD_EDIT_SCHEMA.OPTIONAL")}</span>
              </label>
              <Textarea
                id="schemaDescription"
                rows={2}
                placeholder={t("ADD_EDIT_SCHEMA.WHAT_THIS_SCHEMA_HOLDS_E_G")}
                className="mt-1 w-full resize-none rounded border px-3 py-2 text-sm"
                {...register("description", {
                  validate: (value) =>
                    (value ?? "").trim().length <= SCHEMA_DESCRIPTION_MAX_LENGTH || t("ADD_EDIT_SCHEMA.AT_MOST_SCHEMA_DESCRIPTION_MAX_LENGTH", { SCHEMA_DESCRIPTION_MAX_LENGTH }),
                })}
              />
              {errors.description && <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              {t(COMMON_CANCEL)}
            </Button>
            <Button type="submit" disabled={!isValid}>
              {mode === "edit" ? t("common:SAVE") : t("common:ADD")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <Dialog
        open={isEditConfirmationModalOpen}
        onOpenChange={setIsEditConfirmationModalOpen}
      >
        <DialogContent
          className="mr-4 w-full max-w-[425px] rounded-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left text-lg font-semibold leading-7">
              <AlertCircle className="h-4 w-4 text-indigo-400" />
              {editSchemaConfirmationModalData.dialogTitle}
            </DialogTitle>
            <DialogDescription className="mb-6 mt-2 wrap-break-word text-left text-sm font-normal leading-5 text-medium-emphasis">
              {editSchemaConfirmationModalData.dialogSubtitle}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditConfirmationModalOpen(false)}
            >
              {editSchemaConfirmationModalData.cancelButton || t(COMMON_CANCEL)}
            </Button>
            <Button size="sm" onClick={handleEditConfirm}>
              {editSchemaConfirmationModalData.confirmButton || t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
