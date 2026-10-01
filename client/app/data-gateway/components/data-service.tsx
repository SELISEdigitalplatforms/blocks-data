"use client";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useGetDataServiceConfiguration } from "../hooks/use-configuration";
import { DataServiceInstructions } from "./data-service-instructions";
import { SchemaDetailsPage } from "./schema-details-page";
import LoadingSkeleton from "./security-and-performance/loading-skeleton";

/**
 * Data Gateway route body. Must never leave `<main>` permanently empty:
 * deep-links can mount before project store is ready, and config fetch can fail
 * after a session move — both previously returned `null` and broke E2E/ready checks.
 */
export const DataService = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId ?? "";
  const { data, isLoading, isError, isFetching, refetch } =
    useGetDataServiceConfiguration();

  if (!projectKey || isLoading || (isFetching && !data)) {
    return (
      <div className="space-y-4" data-testid="data-service-loading">
        <p className="text-sm font-semibold text-foreground">Data Gateway</p>
        <div className="overflow-hidden rounded-sm border border-border/40 bg-card">
          <div className="p-5">
            <LoadingSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4" data-testid="data-service-error">
        <p className="text-sm font-semibold text-foreground">Data Gateway</p>
        <p className="text-sm text-muted-foreground">
          Could not load Data Gateway configuration. If you just reopened the
          project, try again.
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => void refetch()}
        >
          Retry
        </button>
        <DataServiceInstructions />
      </div>
    );
  }

  return data.data == null ? <DataServiceInstructions /> : <SchemaDetailsPage />;
};
