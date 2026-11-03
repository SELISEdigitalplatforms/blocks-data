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
import { cn } from "@/lib/utils";
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
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

/** Backend SchemaType.Dto — indexes are only supported on SchemaType.Entity (1). */
const DTO_SCHEMA_TYPE = 2;

/** Backend prefix of the read-only, automatically managed geospatial index rows. */
const GEO_SYSTEM_INDEX_PREFIX = "system:";

/** Tinted, low-contrast tags: colour tells them apart without competing with the index name. */
const TAG_BASE = "border-transparent font-medium";
const TAG_TONES = {
  system: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  custom: "bg-primary/10 text-primary",
  unique: "bg-primary/10 text-primary",
  compound: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  geo: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
};

const DEFAULT_ITEM_ID_INDEX: ISchemaIndex = {
  itemId: "__default-item-id-index__",
  name: "_id_",
  fields: [{ get fieldName() { return tStatic("data.gateway.schema", "SCHEMA_INDEXES_TAB.ITEMID"); }, direction: "ASC" }],
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
  const { t } = useT("data.gateway.schema");
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
        showSuccessToast({ description: t("SCHEMA_INDEXES_TAB.INDEX_DELETED_SUCCESSFULLY") });
      } else {
        const mapped = mapIndexRelatedErrorMessage(res);
        showErrorToast({ errors: mapped ?? res.errors ?? t("SCHEMA_INDEXES_TAB.FAILED_TO_DELETE_INDEX") });
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
      {t("SCHEMA_INDEXES_TAB.ADD_INDEX")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {t("SCHEMA_INDEXES_TAB.LENGTH_OF_MAX_INDEXES_PER_SCHEMA", { length: indexes.length, MAX_INDEXES_PER_SCHEMA })}
        </p>

        {!isFormOpen &&
          (addDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{addIndexButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                {isDto
                  ? t("SCHEMA_INDEXES_TAB.INDEXES_ARE_ONLY_SUPPORTED_ON_ENTITY")
                  : t("SCHEMA_INDEXES_TAB.MAXIMUM_OF_15_INDEXES_REACHED")}
              </TooltipContent>
            </Tooltip>
          ) : (
            addIndexButton
          ))}
      </div>

      {isDto && (
        <p className="text-sm text-muted-foreground">
          {t("SCHEMA_INDEXES_TAB.INDEXES_ARE_ONLY_SUPPORTED_ON_ENTITY")}
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

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && displayedIndexes.length === 0 && (
        !isFormOpen && (
          <div className="flex items-center justify-center rounded-sm border border-dashed border-border/30 bg-muted/5 py-8 text-sm text-muted-foreground">
            {t("SCHEMA_INDEXES_TAB.NO_INDEXES_YET")}
          </div>
        )
      )}
      {!isLoading && displayedIndexes.length !== 0 && (
        <Accordion type="single" collapsible className="flex flex-col gap-2">
          {displayedIndexes.map((index) => {
            const isGeo = index.itemId.startsWith(GEO_SYSTEM_INDEX_PREFIX);
            return (
            <AccordionItem
              key={index.itemId || index.name}
              value={index.itemId || index.name}
              className="rounded-sm border border-border/30 bg-card shadow-xs"
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
                    <Badge variant="outline" className={cn(TAG_BASE, index.isSystem ? TAG_TONES.system : TAG_TONES.custom)}>
                      {index.isSystem ? t("SCHEMA_INDEXES_TAB.SYSTEM") : t("SCHEMA_INDEXES_TAB.CUSTOM")}
                    </Badge>
                    {isGeo && (
                      <Badge
                        variant="outline"
                        className={cn(TAG_BASE, TAG_TONES.geo)}
                        title={t("SCHEMA_INDEXES_TAB.CREATED_AND_DROPPED_AUTOMATICALLY_WITH")}
                      >
                        {t("SCHEMA_INDEXES_TAB.GEOSPATIAL_AUTO")}
                      </Badge>
                    )}
                    {index.fields.length > 1 && (
                      <Badge variant="outline" className={cn(TAG_BASE, TAG_TONES.compound)}>
                        {t("SCHEMA_INDEXES_TAB.COMPOUND")}
                      </Badge>
                    )}
                    {index.isUnique && (
                      <Badge variant="outline" className={cn(TAG_BASE, TAG_TONES.unique)}>
                        {t("SCHEMA_INDEXES_TAB.UNIQUE")}
                      </Badge>
                    )}
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
                        aria-label={t("SCHEMA_INDEXES_TAB.DELETE_INDEX_NAME", { name: index.name })}
                        onClick={() => setPendingDeleteItemId(index.itemId)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("common:DELETE")}</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <AccordionContent className="border-t border-border/30 pb-4 pl-11 pr-4 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("SCHEMA_INDEXES_TAB.PROPERTIES")}
                </p>
                <ul
                  className="mt-2 flex items-center gap-6 overflow-x-auto pb-1"
                  aria-label={t("SCHEMA_INDEXES_TAB.PROPERTIES_FOR_NAME", { name: index.name })}
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
            dialogTitle: t("SCHEMA_INDEXES_TAB.DELETE_INDEX"),
            dialogSubtitle:
              t("SCHEMA_INDEXES_TAB.ARE_YOU_SURE_YOU_WANT_TO"),
            confirmButton: t("common:DELETE"),
            cancelButton: t("common:CANCEL"),
          }}
          buttonState={{ confirm: { disable: isDeleting } }}
        />
      </Dialog>
    </div>
  );
}
