"use client";

import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui-kits/accordion/accordion";
import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
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
import type { IField, ISchemaIndex } from "../../models/data-service";
import {
  flattenIndexableFieldNames,
  INDEX_DIRECTION_LABELS,
  MAX_INDEXES_PER_SCHEMA,
  mapIndexErrorFromException,
  mapIndexRelatedErrorMessage,
} from "../../utils/schema-index.utils";
import { SchemaIndexForm } from "./schema-index-form";

/** Backend SchemaType.Dto — indexes are only supported on SchemaType.Entity (1). */
const DTO_SCHEMA_TYPE = 2;

/** Backend prefix of the read-only, automatically managed geospatial index rows. */
const GEO_SYSTEM_INDEX_PREFIX = "system:";

const DEFAULT_ITEM_ID_INDEX: ISchemaIndex = {
  itemId: "__default-item-id-index__",
  name: "_id_",
  fields: [{ fieldName: "ItemId", direction: "ASC" }],
  isUnique: true,
  createdDate: "",
};

interface SchemaIndexesTabProps {
  schemaDefinitionItemId: string;
  schemaType?: number;
  fields: IField[];
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
  const systemIndexes = data?.data?.systemIndexes ?? [];
  const isDto = schemaType === DTO_SCHEMA_TYPE;
  const displayedIndexes = isDto
    ? indexes.map((index) => ({ ...index, isSystem: false }))
    : [
        { ...DEFAULT_ITEM_ID_INDEX, isSystem: true },
        ...systemIndexes.map((index) => ({ ...index, isSystem: true })),
        ...indexes.map((index) => ({ ...index, isSystem: false })),
      ];
  const atLimit = indexes.length >= MAX_INDEXES_PER_SCHEMA;
  const addDisabled = isDto || atLimit;
  const availableFieldNames = flattenIndexableFieldNames(fields);

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
      const mapped = mapIndexErrorFromException(error);
      showErrorToast({ errors: mapped ?? error });
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
          {indexes.length} of {MAX_INDEXES_PER_SCHEMA} custom indexes
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
      ) : displayedIndexes.length === 0 ? (
        !isFormOpen && (
          <div className="flex items-center justify-center rounded-sm border border-dashed border-border/30 bg-muted/5 py-8 text-sm text-muted-foreground">
            No indexes yet
          </div>
        )
      ) : (
        <Accordion type="single" collapsible className="flex flex-col gap-2">
          {displayedIndexes.map((index) => {
            const isGeo = index.itemId.startsWith(GEO_SYSTEM_INDEX_PREFIX);
            return (
            <AccordionItem
              key={index.itemId || index.name}
              value={index.itemId || index.name}
              className="rounded-sm border border-border/30 bg-card shadow-sm"
            >
              <div className="flex min-w-0 items-center [&>h3]:min-w-0 [&>h3]:flex-1">
                <AccordionTrigger className="min-w-0 flex-row-reverse justify-end gap-3 px-4 py-3 text-left hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center gap-4 pr-4">
                    <span className="truncate text-sm font-semibold" title={index.name}>
                      {index.itemId === DEFAULT_ITEM_ID_INDEX.itemId ? "ItemId(_id_)" : index.name}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {index.fields.length} {index.fields.length === 1 ? "property" : "properties"}
                    </span>
                    {index.itemId === DEFAULT_ITEM_ID_INDEX.itemId && (
                      <Badge variant="outline">Default</Badge>
                    )}
                    {index.itemId !== DEFAULT_ITEM_ID_INDEX.itemId && index.isSystem && (
                      <Badge variant="outline" title="Created and dropped automatically with the GeoJson field">
                        Geospatial · Auto
                      </Badge>
                    )}
                    {index.fields.length > 1 && <Badge variant="outline">Compound</Badge>}
                    {index.isUnique && <Badge variant="secondary">Unique</Badge>}
                  </div>
                </AccordionTrigger>
                {index.isSystem ? (
                  <span className="mr-2 h-8 w-8 shrink-0" aria-hidden="true" />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mr-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete index ${index.name}`}
                        onClick={() => setPendingDeleteItemId(index.itemId)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <AccordionContent className="border-t border-border/30 pb-4 pl-11 pr-4 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Properties
                </p>
                <ul
                  className="mt-2 flex items-center gap-6 overflow-x-auto pb-1"
                  aria-label={`Properties for ${index.name}`}
                >
                  {index.fields.map((field, position) => (
                    <li
                      key={`${field.fieldName}-${position}`}
                      className="flex shrink-0 items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 break-all">{field.fieldName}</span>
                      <span
                        className="text-lg font-semibold leading-none text-muted-foreground"
                        aria-label={isGeo ? "2dsphere" : INDEX_DIRECTION_LABELS[field.direction]}
                        title={isGeo ? "2dsphere" : INDEX_DIRECTION_LABELS[field.direction]}
                      >
                        {isGeo ? "2dsphere" : field.direction === "ASC" ? "↑" : "↓"}
                      </span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
            );
          })}
        </Accordion>
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
