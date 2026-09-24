"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
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
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AddEditSchemaModal } from "../add-edit-schema";
import LoadingSkeleton from "./loading-skeleton";
import SecurityAndPerformancePagination from "./pagination";
import SecurityAndPerformanceTable from "./security-and-performance-table";
import { SecurityExposureSummary } from "./security-exposure-summary";
import { SecurityToolbar } from "./security-toolbar";
import {
  exposureBreakdown,
  filterCounts,
  matchesFilter,
  RISK_FETCH_LIMIT,
  securityAlerts,
  sortByRisk as sortSchemasByRisk,
  type SecurityFilter,
} from "../../utils/security-summary";

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
  const [addSchemaInstance, setAddSchemaInstance] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState<SecurityFilter>("all");
  const [isRiskSorted, setIsRiskSorted] = useState(true);
  const queryClient = useQueryClient();
  const { mutateAsync: createSchema } = useCreateSchema();

  const projectKey = useProjectStore().selectedProject?.tenantId ?? "";
  const { data: schemaListQuery, isLoading } = useSecurityAndPerformanceSchemaList({
    keyword: "",
    projectKey,
    pageNo: 1,
    pageSize: RISK_FETCH_LIMIT,
    schemaType: "entity",
  });

  const handleImportSchemaNotification = useCallback(
    (notificationData: NotificationData) => {
      try {
        const payload = notificationData?.message?.denormalizedPayload;
        if (!payload) return;
        const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
        const message = parsed?.Message ?? parsed;
        if (message?.IsSuccess) {
          queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
        }
      } catch (error) {
        console.error(error);
        showErrorToast({ errors: "Error processing import schema" });
      }
    },
    [queryClient],
  );

  useNotificationListener("schema-import", handleImportSchemaNotification);

  const onSchemaCreate = async (values: ICreateSchemaDefaultValues): Promise<boolean> => {
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

  const schemas = useMemo(
    () => schemaListQuery?.data.schemas.items ?? [],
    [schemaListQuery],
  );
  const permissionCounts = schemaListQuery?.data.aggregation;
  const totalItems = schemaListQuery?.data.schemas.totalCount ?? 0;
  const isEmpty = !isLoading && schemaListQuery !== undefined && schemas.length === 0;

  // The aggregation covers every entity schema in the project; the alerts and
  // chips can only see what was fetched. Worth saying when those differ.
  const isComplete = schemas.length >= totalItems;

  const breakdown = exposureBreakdown(permissionCounts, totalItems);
  const alerts = useMemo(() => securityAlerts(schemas), [schemas]);
  const counts = useMemo(() => filterCounts(schemas), [schemas]);

  const visibleSchemas = useMemo(() => {
    const filtered = schemas.filter((schema) => matchesFilter(schema, filter));
    return isRiskSorted ? sortSchemasByRisk(filtered) : filtered;
  }, [schemas, filter, isRiskSorted]);

  const totalPages = Math.ceil(visibleSchemas.length / pageSize);
  const pageOfSchemas = visibleSchemas.slice((pageNo - 1) * pageSize, pageNo * pageSize);

  const applyFilter = (next: SecurityFilter) => {
    setFilter(next);
    setPageNo(1);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border/40 bg-card">
      {isLoading ? (
        <div className="p-5">
          <LoadingSkeleton />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 ring-1 ring-border/40">
            <ShieldAlert className="h-8 w-8 opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">No schemas yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Add your first schema and configure access permissions to get started.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setAddSchemaInstance((n) => n + 1);
                setIsAddSchemaModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Schema
            </Button>
            <Button size="sm" variant="outline" onClick={onNavigateToSchemas}>
              Go to Schemas <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Security Assessment</h2>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                  Access control overview for all entity schemas
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                setAddSchemaInstance((n) => n + 1);
                setIsAddSchemaModalOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Schema
            </Button>
          </div>

          <SecurityExposureSummary
            breakdown={breakdown}
            alerts={alerts}
            onAlertClick={(alert) =>
              applyFilter(alert.id === "public-write" ? "public" : "attention")
            }
          />

          <SecurityToolbar
            filter={filter}
            counts={counts}
            sortByRisk={isRiskSorted}
            onFilterChange={applyFilter}
            onSortToggle={() => setIsRiskSorted((previous) => !previous)}
          />

          {!isComplete && (
            <p className="shrink-0 border-b border-border/40 bg-muted/20 px-5 py-1.5 text-[11px] text-muted-foreground">
              Showing the first {schemas.length} of {totalItems} schemas. Exposure order and
              the counts above cover only those.
            </p>
          )}

          {/* Table */}
          <div className="min-h-0 flex-1 overflow-auto">
            <SecurityAndPerformanceTable
              schemas={pageOfSchemas}
              onRowClick={onSchemaRowClick}
            />
          </div>

          {/* Pagination */}
          <div className="border-t border-border/40">
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
          </div>
        </>
      )}

      <Dialog open={isAddSchemaModalOpen} onOpenChange={setIsAddSchemaModalOpen}>
        {isAddSchemaModalOpen && (
          <AddEditSchemaModal
            key={addSchemaInstance}
            mode="add"
            onSubmit={onSchemaCreate}
            onCancel={() => setIsAddSchemaModalOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
};

export default SecurityAndPerformance;
