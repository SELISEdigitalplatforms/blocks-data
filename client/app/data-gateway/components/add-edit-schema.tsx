import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { Label } from "@/components/ui-kits/label/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { allowLettersNumbersUnderscoreKeyDown } from "../utils/input-restriction.util";
import { useSchemaList } from "../hooks/use-configuration";
import {
  ICreateSchemaDefaultValues,
  ISchemaDetails,
} from "../models/data-service";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { useProjectStore } from "@seliseblocks/blocks-kit";

type SchemaFormValues = {
  schemaName: string;
  schemaType: "Entity" | "DTO";
  entityName?: string;
};

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
    },
  });

  const [pendingFormData, setPendingFormData] =
    useState<SchemaFormValues | null>(null);
  const [isEditConfirmationModalOpen, setIsEditConfirmationModalOpen] =
    useState(false);
  const editSchemaConfirmationModalData = {
    dialogTitle: "Update schema property",
    dialogSubtitle:
      "Updating the schema properties will impact all existing data. Any necessary updates will need to be handled manually. Are you sure you want to proceed?",
    confirmButton: "Update",
    cancelButton: "Cancel",
  };

  const schemaType = watch("schemaType");
  const schemaName = watch("schemaName");
  const isEntity = schemaType === "Entity";

  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  // Call API to check schema name existence
  const { data: schemaListQuery } = useSchemaList({
    schemaName: schemaName.trim() || "",
    projectKey: projectKey,
    pageNo: 1,
    pageSize: 100,
  });

  useEffect(() => {
    if (mode === "edit" && defaultValues) {
      reset(defaultValues);
    } else {
      reset({
        schemaName: "",
        schemaType: "Entity",
        entityName: "",
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
          message: "Schema with this name already exists",
        });
      } else {
        clearErrors("schemaName");
      }
    }, 0);
  }, [schemaName, schemaListQuery, setError, clearErrors]);

  const onFormSubmit = async (data: SchemaFormValues) => {
    if (mode === "edit") {
      setPendingFormData(data);
      onCancel();
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
    if (pendingFormData) {
      const success = await onSubmit(pendingFormData);
      if (success) {
        resetForm();
        setPendingFormData(null);
      }
    }
    setIsEditConfirmationModalOpen(false);
  };

  return (
    <>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit Schema" : "Add New Schema"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select a source to begin setting up your data connection.
          </p>
          {mode === "edit" && (
            <div className="mb-4 rounded-md border border-base-warning bg-warning-100 p-4 dark:border-icon-warning dark:bg-warning-800/20">
              <div className="flex items-start gap-2 text-warning-700 dark:text-icon-warning">
                <p className="text-sm">
                  Editing schema properties will impact all areas of the
                  application where they are used.
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
                Schema name
              </label>
              <Input
                id="schemaName"
                type="text"
                placeholder="Enter schema name"
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                {...register("schemaName", {
                  required: "Schema name is required",
                  onChange: (e) => {
                    const value = e.target.value;
                    if (mode === "add") {
                      setValue("entityName", `sb_${value}s`);
                    }
                  },
                })}
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
                  Schema Type
                </Label>
                <SelectTrigger id="schemaType">
                  <SelectValue placeholder="Select schema type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entity">Entity</SelectItem>
                  <SelectItem value="DTO">Child</SelectItem>
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
                  Entity name
                </label>
                <Input
                  id="entityName"
                  type="text"
                  placeholder="Enter entity name"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  {...register("entityName", {
                    required: "Entity name is required",
                  })}
                  onKeyDown={allowLettersNumbersUnderscoreKeyDown}
                  readOnly
                />
                {errors.entityName && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.entityName.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              {mode === "edit" ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <Dialog
        open={isEditConfirmationModalOpen}
        onOpenChange={setIsEditConfirmationModalOpen}
      >
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={handleEditConfirm}
          data={editSchemaConfirmationModalData}
        />
      </Dialog>
    </>
  );
};
