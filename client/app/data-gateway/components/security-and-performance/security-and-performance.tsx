"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { SECURITY_PERFORMANCE_SUMMARY_ITEMS } from "@/data-gateway/constants/schema-access-control";
import {
  useCreateSchema,
  useSecurityAndPerformanceSchemaList,
} from "@/data-gateway/hooks/use-configuration";
import {
  ICreateSchemaDefaultValues,
  ICreateSchemaPayload,
} from "@/data-gateway/models/data-service";
import { NotificationData } from "@/data-gateway/models/deployment-notification";
import { Schema } from "@/data-gateway/models/security-and-performance";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { AddEditSchemaModal } from "../add-edit-schema";
import LoadingSkeleton from "./loading-skeleton";
import SecurityAndPerformancePagination from "./pagination";
import SecurityAndPerformanceTable from "./security-and-performance-table";
interface SecurityAndPerformanceProps {
  onSchemaRowClick: (schema: Schema) => void;
  onNavigateToSchemas: () => void;
  onSchemaCreated: (schemaId: string) => void;
}

const SecurityAndPerformance = ({
  onSchemaRowClick,
  onNavigateToSchemas,
  onSchemaCreated,
}: SecurityAndPerformanceProps) => {
  const [isAddSchemaModalOpen, setIsAddSchemaModalOpen] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queryClient = useQueryClient();
  const { mutateAsync: createSchema } = useCreateSchema();

  const projectKey = useProjectStore().selectedProject?.tenantId ?? "";
  const { data: schemaListQuery, isLoading } =
    useSecurityAndPerformanceSchemaList({
      keyword: "",
      projectKey,
      pageNo,
      pageSize,
      schemaType: "entity",
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

  const onSchemaCreate = async (
    values: ICreateSchemaDefaultValues,
  ): Promise<boolean> => {
    const payload: ICreateSchemaPayload = {
      schemaName: values.schemaName,
      collectionName: values.schemaType == "Entity" ? values.entityName : "",
      schemaType: values.schemaType == "Entity" ? 1 : 2,
      projectKey,
    };

    const res = await createSchema(payload);

    if (res.isSuccess) {
      onSchemaCreated(res.data.itemId);
      showSuccessToast({ description: "Schema added successfully" });
      setIsAddSchemaModalOpen(false);
      return true;
    }

    showErrorToast({ errors: res.errors });
    return false;
  };

  const schemas = schemaListQuery?.data.schemas.items ?? [];
  const permissionCounts = schemaListQuery?.data.aggregation;
  const totalItems = schemaListQuery?.data.schemas.totalCount ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const isEmpty =
    !isLoading && schemaListQuery !== undefined && schemas.length === 0;

  return (
    <div className="dark:border-gray-750 flex flex-col rounded border bg-white p-4 dark:bg-slate-950 md:max-h-[calc(100vh-154px)] md:min-h-[calc(100vh-154px)] md:p-5">
      {isLoading ? (
        <LoadingSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
          <ShieldAlert className="h-12 w-12 opacity-30" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              No schemas found
            </p>
            <p className="mt-1 text-xs">
              Go to the Schemas page to add your first schema and manage
              permissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={() => setIsAddSchemaModalOpen(true)}
            >
              <Plus className="h-4 w-4" /> Add Schema
            </Button>
            <Button size="sm" variant="outline" onClick={onNavigateToSchemas}>
              Go to Schemas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Security Assessment</h2>
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={() => setIsAddSchemaModalOpen(true)}
            >
              <Plus className="h-4 w-4" /> Add Schema
            </Button>
          </div>
          <div className="my-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SECURITY_PERFORMANCE_SUMMARY_ITEMS.map((item) => (
              <div key={item.id} className={item.className}>
                <p className="text-base text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-bold text-foreground">
                  {permissionCounts?.[item.countKey] ?? 0}
                </p>
              </div>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto border-b [&>div]:overflow-visible">
            <SecurityAndPerformanceTable
              schemas={schemas}
              onRowClick={onSchemaRowClick}
            />
          </div>
          <SecurityAndPerformancePagination
            pageNo={pageNo}
            totalPages={totalPages}
            pageSize={pageSize}
            isLoading={isLoading}
            onPageChange={setPageNo}
            onPageSizeChange={(value) => {
              setPageSize(Number(value));
              setPageNo(1);
            }}
          />
        </>
      )}

      <Dialog
        open={isAddSchemaModalOpen}
        onOpenChange={setIsAddSchemaModalOpen}
      >
        <AddEditSchemaModal
          mode="add"
          onSubmit={onSchemaCreate}
          onCancel={() => setIsAddSchemaModalOpen(false)}
        />
      </Dialog>
    </div>
  );
};

export default SecurityAndPerformance;
