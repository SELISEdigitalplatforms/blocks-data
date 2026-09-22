import { Button } from "@/components/ui-kits/button/button";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { NotificationData } from "@/data-gateway/models/deployment-notification";
import { useDebounce } from "@/hooks/use-debounce";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { showErrorToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSchemaList } from "../hooks/use-configuration";
import { ISchemaDetails } from "../models/data-service";
import { schemaExposure } from "../utils/schema-exposure";
import { AccessTierDot } from "./primitives";

export type DataGatewayListQueryUpdate = Partial<{
  type: string;
  page: number;
  pageSize: number;
  schemaId: string | null;
}>;

type SchemaListProps = {
  onAddSchema: () => void;
  selectedSchemaId?: string | null;
  isServerActive?: boolean;
  isServerInitiating?: boolean;
  isPodStatusLoading?: boolean;
  filterType: string;
  page: number;
  pageSize: number;
  onListQueryChange: (update: DataGatewayListQueryUpdate) => void;
};

type SearchFormValues = {
  search: string;
};

const SchemaListSkeleton = () => (
  <div className="space-y-1">
    {Array.from({ length: 12 }).map((_, index) => (
      <Skeleton key={index} className="h-[34px] w-full rounded-md" />
    ))}
  </div>
);

/**
 * Entity/Child filters.
 *
 * These were a Tabs group, which promises panels that switch. Nothing switches
 * — the same list is filtered — so they are toggle buttons that say what they
 * are. Values match the server's SchemaType: 1 Entity, 2 Child.
 */
const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "1", label: "Entity" },
  { value: "2", label: "Child" },
] as const;

const SCHEMA_TYPE_LABELS: Record<number, string> = { 1: "Entity", 2: "Child" };

export default function SchemasSidebar({
  onAddSchema,
  selectedSchemaId: externalSelectedSchemaId,
  filterType,
  page,
  pageSize,
  onListQueryChange,
}: SchemaListProps) {
  const queryClient = useQueryClient();

  const { register, watch } = useForm<SearchFormValues>({
    defaultValues: {
      search: "",
    },
  });

  const search = watch("search");
  const debouncedSearch = useDebounce(search, 500);
  const selectedProject = useProjectStore().selectedProject;
  const projectKey = selectedProject?.tenantId || "";
  const [internalSelectedSchemaId, setInternalSelectedSchemaId] = useState<
    string | null
  >(null);

  // Use external selected schema ID if provided, otherwise use internal state
  const selectedSchemaId =
    externalSelectedSchemaId !== undefined
      ? externalSelectedSchemaId
      : internalSelectedSchemaId;

  // Sync internal state with external selected schema ID
  useEffect(() => {
    if (externalSelectedSchemaId !== undefined) {
      setInternalSelectedSchemaId(externalSelectedSchemaId);
    }
  }, [externalSelectedSchemaId]);

  const prevDebouncedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevDebouncedRef.current === undefined) {
      prevDebouncedRef.current = debouncedSearch;
      return;
    }
    if (prevDebouncedRef.current === debouncedSearch) return;
    prevDebouncedRef.current = debouncedSearch;
    onListQueryChange({ page: 1 });
  }, [debouncedSearch, onListQueryChange]);

  const { data: schemaListQuery } = useSchemaList({
    keyword: debouncedSearch,
    projectKey: projectKey,
    pageNo: page,
    pageSize,
    schemaType: filterType == "all" ? "" : filterType,
  });

  const handleImportSchemaNotification = useCallback(
    (notificationData: NotificationData) => {
      try {
        const payload = notificationData?.message?.denormalizedPayload;

        if (!payload) return;

        const parsed =
          typeof payload === "string" ? JSON.parse(payload) : payload;

        const message = parsed?.Message ?? parsed;

        if (message?.IsSuccess) {
          queryClient.invalidateQueries({
            queryKey: ["unadapted-change-logs"],
          });
        }
      } catch (error) {
        console.error(error);
        showErrorToast({
          errors: "Error processing import schema",
        });
      }
    },
    [queryClient],
  );

  useNotificationListener("schema-import", handleImportSchemaNotification);

  // Server-side filtering is now applied, so we use the data directly
  const schemas =
    schemaListQuery?.data?.items?.map((schema: ISchemaDetails) => ({
      ...schema,
    })) ?? [];

  const handlePrev = () => {
    onListQueryChange({ page: page - 1 });
  };

  const handleNext = () => {
    onListQueryChange({ page: page + 1 });
  };

  const handleSelectSchema = (id: string) => {
    setInternalSelectedSchemaId(id);
    onListQueryChange({ schemaId: id });
  };

  const totalCount = schemaListQuery?.data?.totalCount || 0;

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-sm border border-border/40 bg-card lg:w-[264px]">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 pl-4 pr-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Schemas</h2>
        {schemaListQuery?.data && (
          <span className="text-[11px] text-muted-foreground" aria-label={`${totalCount} schemas`}>
            {totalCount}
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" className="h-[26px] shrink-0 gap-1 px-2.5 text-xs" onClick={onAddSchema}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Filter by name */}
      <div className="shrink-0 border-b border-border/40 px-2.5 py-2">
        <div className="flex h-[30px] items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 focus-within:border-primary/40">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="text"
            placeholder="Search schemas…"
            aria-label="Search schemas"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
            {...register("search")}
          />
        </div>
      </div>

      {/* Type filter */}
      <div className="flex shrink-0 gap-1.5 border-b border-border/40 px-2.5 py-2">
        {TYPE_FILTERS.map(({ value, label }) => {
          const active = filterType === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onListQueryChange({ type: value, page: 1 })}
              className={cn(
                "h-[25px] rounded-full border px-2.5 text-[11px] transition-colors",
                active
                  ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                  : "border-border/40 font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Schema list */}
      <div className="flex-1 overflow-auto px-2 py-1.5">
        {!schemaListQuery?.data ? (
          <SchemaListSkeleton />
        ) : schemas.length > 0 ? (
          schemas.map((schema: ISchemaDetails) => {
            const isSelected = schema.id === selectedSchemaId;
            const exposure = schemaExposure(schema);
            const typeLabel = SCHEMA_TYPE_LABELS[schema.schemaType] ?? "";
            // Reference count used to be a badge behind the Child filter. The
            // row has no room for it in a flat list, so it rides the tooltip.
            const references = schema.totalSchemaReferences
              ? `${schema.schemaName} · ${schema.totalSchemaReferences} reference(s)`
              : schema.schemaName;

            return (
              <button
                key={schema.schemaName}
                type="button"
                onClick={() => handleSelectSchema(schema.id)}
                aria-current={isSelected ? "true" : undefined}
                title={references}
                className={cn(
                  "relative flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left transition-colors",
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {isSelected && (
                  <span className="absolute inset-y-2 left-0 w-[2.5px] rounded-r-sm bg-primary" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    isSelected ? "font-semibold" : "font-normal",
                  )}
                >
                  {schema.schemaName}
                </span>
                {exposure && <AccessTierDot tier={exposure.tier} title={exposure.reason} />}
                <span
                  className={cn(
                    "shrink-0 text-[11px]",
                    isSelected ? "text-primary/60" : "text-muted-foreground/70",
                  )}
                >
                  {typeLabel}
                </span>
              </button>
            );
          })
        ) : (
          <div className="flex h-full items-center justify-center py-8 text-sm text-muted-foreground/60">
            No schemas found
          </div>
        )}
      </div>

      {schemaListQuery?.data && totalCount > pageSize && (
        <div className="flex h-[38px] shrink-0 items-center gap-1.5 border-t border-border/40 pl-3 pr-2 text-[11px] text-muted-foreground">
          <p>{`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}</p>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            onClick={handlePrev}
            disabled={page <= 1}
            className="h-6 w-6 rounded-md border-border/40 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            onClick={handleNext}
            disabled={page * pageSize >= totalCount}
            className="h-6 w-6 rounded-md border-border/40 disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
