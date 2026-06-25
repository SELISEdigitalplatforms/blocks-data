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
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Globe, Lock, Plus, ShieldAlert, Users } from "lucide-react";
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

const STAT_CARDS = [
  {
    key: "totalPublicPermission" as const,
    label: "Public",
    icon: Globe,
    glow: "shadow-[0_0_24px_-4px_rgba(244,63,94,0.35)]",
    iconRing: "ring-rose-500/30",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    numClass: "bg-gradient-to-br from-rose-300 to-rose-500 bg-clip-text text-transparent",
    borderAccent: "border-l-2 border-rose-500/40",
    bg: "bg-gradient-to-br from-rose-950/30 via-transparent to-transparent dark:from-rose-950/40",
  },
  {
    key: "totalUserPermission" as const,
    label: "Logged-in users",
    icon: Users,
    glow: "shadow-[0_0_24px_-4px_rgba(245,158,11,0.35)]",
    iconRing: "ring-amber-500/30",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    numClass: "bg-gradient-to-br from-amber-300 to-amber-500 bg-clip-text text-transparent",
    borderAccent: "border-l-2 border-amber-500/40",
    bg: "bg-gradient-to-br from-amber-950/30 via-transparent to-transparent dark:from-amber-950/40",
  },
  {
    key: "totalCustomPermission" as const,
    label: "Custom rules",
    icon: Lock,
    glow: "shadow-[0_0_24px_-4px_rgba(16,185,129,0.35)]",
    iconRing: "ring-emerald-500/30",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    numClass: "bg-gradient-to-br from-emerald-300 to-emerald-500 bg-clip-text text-transparent",
    borderAccent: "border-l-2 border-emerald-500/40",
    bg: "bg-gradient-to-br from-emerald-950/30 via-transparent to-transparent dark:from-emerald-950/40",
  },
] as const;

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
  const { data: schemaListQuery, isLoading } = useSecurityAndPerformanceSchemaList({
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

  const schemas = schemaListQuery?.data.schemas.items ?? [];
  const permissionCounts = schemaListQuery?.data.aggregation;
  const totalItems = schemaListQuery?.data.schemas.totalCount ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const isEmpty = !isLoading && schemaListQuery !== undefined && schemas.length === 0;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-sm border border-border/40 bg-card md:max-h-[calc(100vh-154px)] md:min-h-[calc(100vh-154px)]">
      {/* Subtle background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.04),transparent_60%)]" />

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
            <Button size="sm" onClick={() => setIsAddSchemaModalOpen(true)}>
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
          <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border/40 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
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
              className="shrink-0 bg-primary/90 shadow-[0_0_16px_-2px_rgba(99,102,241,0.4)] hover:bg-primary"
              onClick={() => setIsAddSchemaModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add Schema
            </Button>
          </div>

          {/* Stats */}
          <div className="grid shrink-0 grid-cols-3 divide-x divide-border/30 border-b border-border/40">
            {STAT_CARDS.map((card) => {
              const count = permissionCounts?.[card.key] ?? 0;
              return (
                <div key={card.key} className={cn("relative flex items-center gap-4 px-6 py-5", card.bg)}>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", card.iconBg, card.iconRing, card.glow)}>
                    <card.icon className={cn("h-4 w-4", card.iconColor)} />
                  </div>
                  <div>
                    <p className={cn("text-3xl font-bold leading-none tracking-tight", card.numClass)}>
                      {count}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground/70">{card.label}</p>
                  </div>
                  <div className={cn("absolute inset-y-0 left-0", card.borderAccent)} />
                </div>
              );
            })}
          </div>

          {/* Table */}
          <div className="min-h-0 flex-1 overflow-auto">
            <SecurityAndPerformanceTable schemas={schemas} onRowClick={onSchemaRowClick} />
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
