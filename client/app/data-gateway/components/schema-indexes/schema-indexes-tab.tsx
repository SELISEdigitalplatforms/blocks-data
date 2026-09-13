"use client";

import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import { Card } from "@/components/ui-kits/card/card";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui-kits/tooltip/tooltip";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { Plus, Trash } from "lucide-react";
import { useState } from "react";
import {
  useDeleteSchemaIndex,
  useSchemaIndexes,
} from "../../hooks/use-configuration";
import {
  INDEX_DIRECTION_LABELS,
  MAX_INDEXES_PER_SCHEMA,
  mapIndexRelatedErrorMessage,
} from "../../utils/schema-index.utils";
import { SchemaIndexForm } from "./schema-index-form";

/** Backend SchemaType.Dto — indexes are only supported on SchemaType.Entity (1). */
const DTO_SCHEMA_TYPE = 2;

interface SchemaIndexesTabProps {
  schemaDefinitionItemId: string;
  schemaType?: number;
  fields: Array<{ name: string }>;
}

export function SchemaIndexesTab({
  schemaDefinitionItemId,
  schemaType,
  fields,
}: SchemaIndexesTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(
    null,
  );

  const { data, isLoading } = useSchemaIndexes(schemaDefinitionItemId);
  const { mutateAsync: deleteIndex, isPending: isDeleting } =
    useDeleteSchemaIndex();

  const indexes = data?.data?.indexes ?? [];
  const isDto = schemaType === DTO_SCHEMA_TYPE;
  const atLimit = indexes.length >= MAX_INDEXES_PER_SCHEMA;
  const addDisabled = isDto || atLimit;
  const availableFieldNames = fields.map((f) => f.name);

  const handleDelete = async () => {
    if (!pendingDeleteItemId) return;
    try {
      const res = await deleteIndex({
        itemId: pendingDeleteItemId,
        schemaDefinitionItemId,
      });
      if (res.isSuccess) {
        showSuccessToast({ description: "Index deleted successfully" });
      } else {
        const mapped = mapIndexRelatedErrorMessage(res);
        showErrorToast({ errors: mapped ?? res.errors ?? "Failed to delete index." });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    } finally {
      setPendingDeleteItemId(null);
    }
  };

  const addIndexButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={addDisabled}
      onClick={() => setIsFormOpen(true)}
    >
      <Plus className="h-4 w-4" />
      Add index
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {indexes.length} of {MAX_INDEXES_PER_SCHEMA} indexes
        </p>

        {!isFormOpen &&
          (addDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{addIndexButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                {isDto
                  ? "Indexes are only supported on Entity schemas."
                  : "Maximum of 15 indexes reached."}
              </TooltipContent>
            </Tooltip>
          ) : (
            addIndexButton
          ))}
      </div>

      {isDto && (
        <p className="text-sm text-muted-foreground">
          Indexes are only supported on Entity schemas.
        </p>
      )}

      {isFormOpen && (
        <SchemaIndexForm
          schemaDefinitionItemId={schemaDefinitionItemId}
          availableFields={availableFieldNames}
          onSaved={() => setIsFormOpen(false)}
          onCancel={() => setIsFormOpen(false)}
        />
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : indexes.length === 0 ? (
        !isFormOpen && (
          <div className="flex items-center justify-center rounded-sm border border-dashed border-border/30 bg-muted/5 py-8 text-sm text-muted-foreground">
            No indexes yet
          </div>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {indexes.map((index) => (
            <Card
              key={index.itemId}
              className="flex min-w-0 flex-col gap-3 p-4 shadow-none"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h3 className="break-all text-sm font-semibold">{index.name}</h3>
                  {index.isUnique && <Badge variant="secondary">Unique</Badge>}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete index ${index.name}`}
                      onClick={() => setPendingDeleteItemId(index.itemId)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Properties and order
                </p>
                <ol
                  className="mt-2 flex flex-col gap-2"
                  aria-label={`Properties and order for ${index.name}`}
                >
                  {index.fields.map((field, position) => (
                    <li
                      key={`${field.fieldName}-${position}`}
                      className="flex min-w-0 items-center gap-2 text-sm"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                        {position + 1}
                      </span>
                      <span className="min-w-0 flex-1 break-all">{field.fieldName}</span>
                      <Badge variant="outline" className="shrink-0 font-normal">
                        {INDEX_DIRECTION_LABELS[field.direction]}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={pendingDeleteItemId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteItemId(null);
        }}
      >
        <ConfirmationModal
          onCancel={() => setPendingDeleteItemId(null)}
          onConfirm={() => void handleDelete()}
          data={{
            dialogTitle: "Delete index?",
            dialogSubtitle:
              "Are you sure you want to delete this index? This action cannot be undone.",
            confirmButton: "Delete",
            cancelButton: "Cancel",
          }}
          buttonState={{ confirm: { disable: isDeleting } }}
        />
      </Dialog>
    </div>
  );
}
