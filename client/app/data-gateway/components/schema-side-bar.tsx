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
import {
  useInitiateDataGatewayPipeline,
  useSchemaList,
  useSchemasReload,
} from "../hooks/use-configuration";
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
  onServerStart?: () => void;
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
  isServerActive = true,
  isServerInitiating = false,
  isPodStatusLoading = false,
  onServerStart,
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
  const projectShortKey = selectedProject?.tenantSlug || "";
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

  const { refetch: initiateServer, isFetching: isStarting } =
    useInitiateDataGatewayPipeline({
      projectKey,
      enabled: false,
    });
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

  const startServer = async () => {
    try {
      const res = await initiateServer();
      if (res.data) {
        showSuccessToast({ description: "Data Gateway server is starting up" });
        onServerStart?.();
      } else {
        showErrorToast({ errors: "Failed to start Data Gateway server" });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  const restartAll = async () => {
    try {
      const payload = { projectKey, projectShortKey };
      const res = await mutateAsync(payload);
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
    <div className="flex h-[calc(100vh-154px)] w-full min-w-0 flex-col rounded-lg border border-border bg-card p-4 lg:w-[300px]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">Schemas</h2>
        {!isServerActive ? (
          isServerInitiating ? (
            <Button
              variant="outline"
              className="flex items-center gap-2 text-sm font-bold text-gray-500"
              disabled
            >
              <RotateCcw className="h-4 w-4 text-gray-500" />
              <span className="ml-1">Publish</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex items-center gap-2 text-sm font-bold text-gray-500"
              onClick={startServer}
              disabled={isStarting || isPodStatusLoading}
            >
              <RotateCcw
                className={cn(
                  "h-4 w-4 cursor-pointer text-gray-500 hover:text-black",
                  isStarting && "animate-spin",
                )}
              />
              <span className="ml-1">Start</span>
            </Button>
          )
        ) : (
          schemas.length > 0 && (
            <Button
              variant="outline"
              className="flex items-center gap-2 text-sm font-bold text-gray-500"
              onClick={() => restartAll()}
              disabled={isPublishing}
            >
              <RotateCcw
                className={cn(
                  "h-4 w-4 cursor-pointer text-gray-500 hover:text-black",
                  isPublishing && "animate-spin",
                )}
              />
              <span className="ml-1">Publish</span>
            </Button>
          )
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Input
          placeholder="Search"
          className="h-8 flex-1"
          {...register("search")}
        />
        <Button size="sm" className="h-8 px-2" onClick={onAddSchema}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <Tabs
        value={filterType}
        onValueChange={(value) => onListQueryChange({ type: value, page: 1 })}
      >
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">
            All
          </TabsTrigger>
          <TabsTrigger value="1" className="flex-1">
            Entity
          </TabsTrigger>
          <TabsTrigger value="2" className="flex-1">
            Child
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {!schemaListQuery?.data ? (
        <div className="mt-4 flex-1 overflow-auto">
          <SchemaListSkeleton />
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-2 overflow-auto">
          {schemas && schemas.length > 0 ? (
            schemas.map((schema: ISchemaDetails) => {
              const isSelected = schema.id === selectedSchemaId;
              return (
                <div
                  key={schema.schemaName}
                  onClick={() => handleSelectSchema(schema.id)}
                  className={cn(
                    "flex cursor-pointer justify-between rounded-md px-3 py-3 text-sm transition-all",
                    isSelected
                      ? "bg-muted font-medium text-primary"
                      : "text-low-emphasis hover:bg-muted hover:text-primary",
                  )}
                >
                  <span className="w-2/3 truncate" title={schema.schemaName}>
                    {schema.schemaName}
                  </span>
                  {filterType === "all" && (
                    <span
                      className={cn(
                        isSelected ? "text-primary/70" : "text-low-emphasis/60",
                      )}
                    >
                      {schema.schemaType == 1 ? "Entity" : "Child"}
                    </span>
                  )}
                  {filterType === "2" && schema.totalSchemaReferences > 0 && (
                    // <Tooltip>
                    //   <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      title={`Has ${schema.totalSchemaReferences} reference(s) in entities`}
                    >
                      {schema.totalSchemaReferences}
                    </Badge>
                    //   </TooltipTrigger>
                    //   <TooltipContent>Test</TooltipContent>
                    // </Tooltip>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No Schemas Found!
            </div>
          )}
        </div>
      )}

      {schemaListQuery?.data && totalCount > pageSize && (
        <div className="mt-auto flex w-full items-center justify-between border-t pt-4 text-sm text-medium-emphasis">
          <p>{`${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`}</p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={page <= 1}
              className="h-8 w-8 p-0 text-primary disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              onClick={handleNext}
              disabled={page * pageSize >= totalCount}
              className="h-8 w-8 p-0 text-primary disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
