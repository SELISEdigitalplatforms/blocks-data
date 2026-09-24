"use client";

import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { AlertTriangle, Check, RotateCcw } from "lucide-react";
import { useState } from "react";

import { useGetUnadaptedChangeLogs, useSchemasReload } from "../../hooks/use-configuration";

type PublishState = "clean" | "pending" | "publishing" | "failed";

/**
 * Publishing, as one control in the page bar.
 *
 * It used to take two widgets that never agreed with each other: a red banner
 * on the schemas page that said changes were unadapted, and a Publish button in
 * the schema sidebar that only appeared once at least one schema existed — so
 * the warning could be on screen with no button next to it. Count and action
 * are the same control now, and it is visible from every section.
 */
export const PublishControl = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { data: unadaptedChangeLogs } = useGetUnadaptedChangeLogs({ projectKey });
  const { mutateAsync: reloadSchemas, isPending: isPublishing } = useSchemasReload();
  const [hasFailed, setHasFailed] = useState(false);

  const pendingCount = unadaptedChangeLogs?.data?.length ?? 0;

  const state: PublishState = isPublishing
    ? "publishing"
    : hasFailed
      ? "failed"
      : pendingCount > 0
        ? "pending"
        : "clean";

  const publish = async () => {
    setHasFailed(false);
    try {
      const res = await reloadSchemas();
      if (res.isSuccess) {
        showSuccessToast({ description: "Schemas published successfully" });
        return;
      }
      setHasFailed(true);
      showErrorToast({ errors: "Something went wrong" });
    } catch (error) {
      setHasFailed(true);
      showErrorToast({ errors: error });
    }
  };

  // Nothing waiting: publishing is still allowed (it re-adapts the gateway), so
  // the control stays clickable but drops to the quietest styling in the bar.
  if (state === "clean") {
    return (
      <button
        type="button"
        onClick={publish}
        aria-label="Publish"
        title="Everything is published. Publishing again re-adapts the gateway."
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/50 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Check className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Published</span>
      </button>
    );
  }

  const failed = state === "failed";

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border",
        failed ? "border-base-error" : "border-warning-500/50",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 text-xs font-medium",
          failed
            ? "bg-blocks-error-100 text-blocks-error-800"
            : "bg-warning-100 text-warning-800",
        )}
      >
        {failed ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full bg-warning-500",
              state === "publishing" && "animate-pulse",
            )}
            aria-hidden
          />
        )}
        <span className="whitespace-nowrap">
          {failed
            ? "Publish failed"
            : state === "publishing"
              ? "Publishing…"
              : `${pendingCount} unpublished`}
        </span>
      </div>

      <button
        type="button"
        onClick={publish}
        disabled={isPublishing}
        className={cn(
          "flex items-center gap-1.5 px-3 text-xs font-semibold transition-opacity disabled:opacity-70",
          failed
            ? "bg-blocks-error-800 text-blocks-error-100"
            : "bg-warning-800 text-warning-50",
        )}
      >
        <RotateCcw className={cn("h-3.5 w-3.5", isPublishing && "animate-spin")} />
        {failed ? "Retry" : "Publish"}
      </button>
    </div>
  );
};
