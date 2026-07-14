import { Badge } from "@/components/ui-kits/badge/badge";
import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { NotificationData } from "@/data-gateway/models/deployment-notification";
import { useDebounce } from "@/hooks/use-debounce";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSchemaList, useSchemasReload } from "../hooks/use-configuration";
import { ISchemaDetails } from "../models/data-service";

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
  <div className="space-y-2">
    {Array.from({ length: 12 }).map((_, index) => (
      <Skeleton key={index} className="h-10 w-full rounded-md" />
    ))}
  </div>
);

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

  const { mutateAsync, isPending: isPublishing } = useSchemasReload();
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

  const restartAll = async () => {
    try {
      const res = await mutateAsync();
      if (res.isSuccess) {
        showSuccessToast({ description: "Schemas published successfully" });
      } else {
        showErrorToast({ errors: "Something went wrong" });
      }
    } catch (error) {
      return showErrorToast({ errors: error });
    }
  };

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
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-sm border border-border/40 bg-card lg:w-[300px]">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.04),transparent_60%)]" />

      {/* Header */}
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Schemas</h2>
        {schemas.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground"
            onClick={() => restartAll()}
            disabled={isPublishing}
          >
            <RotateCcw className={cn("h-3.5 w-3.5", isPublishing && "animate-spin")} />
            Publish
          </Button>
        )}
      </div>

      {/* Search + Add */}
      <div className="relative flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <Input
          placeholder="Search schemas…"
          className="h-8 flex-1 border-border/40 bg-muted/20 text-xs placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-primary/20"
          {...register("search")}
        />
        <Button size="sm" className="h-8 shrink-0 px-2.5 shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]" onClick={onAddSchema}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="relative shrink-0 border-b border-border/40 px-3 py-2">
        <Tabs value={filterType} onValueChange={(value) => onListQueryChange({ type: value, page: 1 })}>
          <TabsList className="w-full bg-muted/20">
            <TabsTrigger value="all" className="flex-1 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">All</TabsTrigger>
            <TabsTrigger value="1" className="flex-1 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Entity</TabsTrigger>
            <TabsTrigger value="2" className="flex-1 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Child</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Schema list */}
      {!schemaListQuery?.data ? (
        <div className="relative flex-1 overflow-auto px-2 py-1">
          <SchemaListSkeleton />
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto px-2 py-1">
          {schemas && schemas.length > 0 ? (
            schemas.map((schema: ISchemaDetails) => {
              const isSelected = schema.id === selectedSchemaId;
              return (
                <div
                  key={schema.schemaName}
                  onClick={() => handleSelectSchema(schema.id)}
                  className={cn(
                    "relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg px-3 py-2.5 text-sm transition-all duration-150",
                    isSelected
                      ? "bg-primary/10 font-medium text-primary shadow-[0_0_16px_-4px_rgba(99,102,241,0.25)]"
                      : "text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
                  )}
                  <span className="truncate" title={schema.schemaName}>
                    {schema.schemaName}
                  </span>
                  {filterType === "all" && (
                    <span className={cn("shrink-0 text-xs", isSelected ? "text-primary/50" : "text-muted-foreground/30")}>
                      {schema.schemaType == 1 ? "Entity" : "Child"}
                    </span>
                  )}
                  {filterType === "2" && schema.totalSchemaReferences > 0 && (
                    <Badge variant="secondary" className="shrink-0 bg-primary/10 text-xs text-primary/70 ring-1 ring-primary/20" title={`${schema.totalSchemaReferences} reference(s)`}>
                      {schema.totalSchemaReferences}
                    </Badge>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center py-8 text-sm text-muted-foreground/50">
              No schemas found
            </div>
          )}
        </div>
      )}

      {schemaListQuery?.data && totalCount > pageSize && (
        <div className="relative mt-auto flex w-full shrink-0 items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground/60">
          <p>{`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={handlePrev} disabled={page <= 1} className="h-7 w-7 rounded-lg border-border/40 disabled:opacity-20 hover:border-primary/40 hover:text-primary">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleNext} disabled={page * pageSize >= totalCount} className="h-7 w-7 rounded-lg border-border/40 disabled:opacity-20 hover:border-primary/40 hover:text-primary">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
