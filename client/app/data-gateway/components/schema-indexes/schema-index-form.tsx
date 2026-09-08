"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Card } from "@/components/ui-kits/card/card";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { useCreateSchemaIndex } from "../../hooks/use-configuration";
import type { ICreateSchemaIndexPayload } from "../../models/data-service";
import {
  INDEX_DIRECTION_LABELS,
  MAX_INDEX_FIELDS,
  mapIndexRelatedErrorMessage,
} from "../../utils/schema-index.utils";

const indexFormSchema = z.object({
  fields: z
    .array(
      z.object({
        fieldName: z.string().min(1, "Field is required"),
        direction: z.enum(["ASC", "DESC"]),
      }),
    )
    .min(1, "Select at least one field")
    .max(MAX_INDEX_FIELDS, `An index can cover at most ${MAX_INDEX_FIELDS} fields`)
    .refine(
      (fields) => new Set(fields.map((f) => f.fieldName)).size === fields.length,
      { message: "Select at least one field, with no field repeated." },
    ),
  isUnique: z.boolean(),
});

type IndexFormValues = z.infer<typeof indexFormSchema>;

interface SchemaIndexFormProps {
  schemaDefinitionItemId: string;
  availableFields: string[];
  onSaved: () => void;
  onCancel: () => void;
}

export function SchemaIndexForm({
  schemaDefinitionItemId,
  availableFields,
  onSaved,
  onCancel,
}: SchemaIndexFormProps) {
  const { mutateAsync: createIndex, isPending } = useCreateSchemaIndex();

  const form = useForm<IndexFormValues>({
    resolver: zodResolver(indexFormSchema),
    mode: "onChange",
    defaultValues: {
      fields: [{ fieldName: "", direction: "ASC" }],
      isUnique: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "fields",
  });

  const selectedFieldNames = form.watch("fields").map((f) => f.fieldName);

  const onSubmit = async (values: IndexFormValues) => {
    const payload: ICreateSchemaIndexPayload = {
      schemaDefinitionItemId,
      fields: values.fields,
      isUnique: values.isUnique,
    };

    try {
      const res = await createIndex(payload);
      if (res.isSuccess) {
        showSuccessToast({ description: "Index added successfully" });
        onSaved();
      } else {
        const mapped = mapIndexRelatedErrorMessage(res);
        form.setError("root", { message: mapped ?? "Failed to create index." });
        if (!mapped) showErrorToast({ errors: res.errors });
      }
    } catch (error) {
      form.setError("root", { message: "Failed to create index." });
      showErrorToast({ errors: error });
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4 shadow-none">
      <p className="text-sm font-medium">Add index</p>

      <div className="flex flex-col gap-3">
        {fields.map((fieldRow, index) => {
          const currentFieldName = form.watch(`fields.${index}.fieldName`);
          const fieldOptions = availableFields.filter(
            (name) => name === currentFieldName || !selectedFieldNames.includes(name),
          );

          return (
            <div key={fieldRow.id} className="flex items-center gap-2">
              <Select
                value={currentFieldName || undefined}
                onValueChange={(value) =>
                  form.setValue(`fields.${index}.fieldName`, value, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="h-9 w-full min-w-0 flex-1">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={form.watch(`fields.${index}.direction`)}
                onValueChange={(value) =>
                  form.setValue(
                    `fields.${index}.direction`,
                    value as "ASC" | "DESC",
                    { shouldValidate: true },
                  )
                }
              >
                <SelectTrigger className="h-9 w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASC">{INDEX_DIRECTION_LABELS.ASC}</SelectItem>
                  <SelectItem value="DESC">{INDEX_DIRECTION_LABELS.DESC}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove field"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {form.formState.errors.fields?.root?.message && (
        <p className="text-xs text-destructive">
          {form.formState.errors.fields.root.message}
        </p>
      )}
      {form.formState.errors.fields?.message && (
        <p className="text-xs text-destructive">
          {form.formState.errors.fields.message}
        </p>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={fields.length >= MAX_INDEX_FIELDS}
          onClick={() => append({ fieldName: "", direction: "ASC" })}
        >
          <Plus className="h-4 w-4" />
          Add field
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="index-is-unique"
          checked={form.watch("isUnique")}
          onCheckedChange={(checked) =>
            form.setValue("isUnique", checked === true)
          }
        />
        <label htmlFor="index-is-unique" className="cursor-pointer text-sm">
          Unique
        </label>
      </div>

      {form.formState.errors.root?.message && (
        <p className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!form.formState.isValid || isPending}
          onClick={() => void form.handleSubmit(onSubmit)()}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
