"use client";

import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { PanelLeftOpen } from "lucide-react";
import { useSchemaList } from "../hooks/use-configuration";
import { ISchemaDetails } from "../models/data-service";

/**
 * The collapsed Explorer — an initial per schema instead of a bare "Schemas"
 * label, so switching schemas doesn't require reopening the full list first.
 * Reads the same page of schemas `SchemasSidebar` would, since only one of
 * the two is ever mounted at a time.
 */
export function SchemaRail({
  filterType,
  page,
  pageSize,
  selectedSchemaId,
  onSelectSchema,
  onExpand,
}: {
  filterType: string;
  page: number;
  pageSize: number;
  selectedSchemaId?: string | null;
  onSelectSchema: (id: string) => void;
  onExpand: () => void;
}) {
  const projectKey = useProjectStore().selectedProject?.tenantId ?? "";
  const { data: schemaListQuery } = useSchemaList({
    keyword: "",
    projectKey,
    pageNo: page,
    pageSize,
    schemaType: filterType === "all" ? "" : filterType,
  });
  const schemas = schemaListQuery?.data?.items ?? [];

  return (
    <div className="flex h-full w-full shrink-0 flex-col items-center overflow-hidden rounded-sm border border-border/40 bg-card">
      {/* h-11 and a full-width rule, matching `SchemasSidebar`'s header — the
          two swap in the same slot, so a mismatch here reads as the panel's
          top edge stepping as it collapses. */}
      <div className="flex h-11 w-full shrink-0 items-center justify-center border-b border-border/40">
        <button
          type="button"
          onClick={onExpand}
          aria-label="Show the schema list"
          className="dg-interactive flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2">
        {schemas.map((schema: ISchemaDetails) => {
          const isSelected = schema.id === selectedSchemaId;
          return (
            <button
              key={schema.id}
              type="button"
              title={schema.schemaName}
              aria-label={schema.schemaName}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelectSchema(schema.id)}
              className={cn(
                "dg-interactive relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isSelected
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {/* Same 2.5px marker, inset and radius as the sidebar's selected
                  row, so the indicator stays put across the collapse. */}
              {isSelected && (
                <span className="absolute inset-y-2 -left-[9px] w-[2.5px] rounded-r-sm bg-primary" />
              )}
              {schema.schemaName.charAt(0).toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
