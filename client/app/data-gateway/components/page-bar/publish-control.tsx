"use client";

import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { format, isThisYear, isToday } from "date-fns";
import { AlertTriangle, Check, History, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  useGetUnadaptedChangeLogs,
  useSchemaRollback,
  useSchemasReload,
  useSchemaVersionHistory,
} from "../../hooks/use-configuration";
import { ISchemaVersionSummary } from "../../models/data-service";

type PublishState = "clean" | "pending" | "publishing" | "failed";

const formatPublishedDate = (value: string) => {
  const date = new Date(value);
  if (isToday(date)) return `Today ${format(date, "HH:mm")}`;
  return format(date, isThisYear(date) ? "d MMM" : "d MMM yyyy");
};

const describeVersion = (version: ISchemaVersionSummary) => {
  const date = formatPublishedDate(version.publishedDate);
  if (version.kind === "Bootstrap") return `${date} · First version · from drafts`;
  const changes = `${version.changeCount} ${version.changeCount === 1 ? "change" : "changes"}`;
  return [date, version.publishedBy, changes].filter(Boolean).join(" · ");
};

/**
 * Publishing, as one control in the page bar.
 *
 * It used to take two widgets that never agreed with each other: a red banner
 * on the schemas page that said changes were unadapted, and a Publish button in
 * the schema sidebar that only appeared once at least one schema existed — so
 * the warning could be on screen with no button next to it. Count and action
 * are the same control now, and it is visible from every section.
 *
 * It also shows which published version the gateway serves, and opens the
 * version history, where an earlier version can be made live again. Both are
 * left out for roles that may not read the history.
 */
export const PublishControl = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { data: unadaptedChangeLogs } = useGetUnadaptedChangeLogs({ projectKey });
  const { mutateAsync: reloadSchemas, isPending: isPublishing } = useSchemasReload();
  const { data: historyResponse } = useSchemaVersionHistory({ projectKey });
  const [hasFailed, setHasFailed] = useState(false);

  const pendingCount = unadaptedChangeLogs?.data?.length ?? 0;
  const history = historyResponse?.isSuccess ? historyResponse.data : null;
  // Only a version that is in the history is shown: until a tenant's first
  // published version exists, there is nothing to name.
  const liveVersion = history?.versions.some((v) => v.isCurrent) ? history.currentVersion : null;

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
      // A schema that does not build comes back with the reason; show it.
      showErrorToast({ errors: isErrorWithErrors(error) ? error.errors : error });
    }
  };

  // Nothing waiting: publishing is still allowed (it re-adapts the gateway), so
  // the control stays clickable but drops to the quietest styling in the bar.
  if (state === "clean") {
    return (
      <div className="flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-border/50">
        <button
          type="button"
          onClick={publish}
          aria-label="Publish"
          title="Everything is published. Publishing again re-adapts the gateway."
          className="flex items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">
            Published{liveVersion !== null && ` · v${liveVersion}`}
          </span>
        </button>
        {history && <VersionHistory history={history} className="border-l border-border/50" />}
      </div>
    );
  }

  const failed = state === "failed";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
            {!failed && state !== "publishing" && liveVersion !== null && (
              <span className="hidden lg:inline"> · live v{liveVersion}</span>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={publish}
          disabled={isPublishing}
          className={cn(
            "flex items-center gap-1.5 px-3 text-xs font-semibold transition-opacity disabled:opacity-70",
            failed ? "bg-blocks-error-800 text-blocks-error-100" : "bg-warning-800 text-warning-50",
          )}
        >
          <RotateCcw className={cn("h-3.5 w-3.5", isPublishing && "animate-spin")} />
          {failed ? "Retry" : "Publish"}
        </button>
      </div>

      {history && (
        <VersionHistory history={history} className="h-8 rounded-lg border border-border/50" />
      )}
    </div>
  );
};

interface VersionHistoryProps {
  history: { currentVersion: number; versions: ISchemaVersionSummary[] };
  className?: string;
}

/**
 * The kept published versions, newest first, with the live one marked. Any
 * other version can be made live again after a confirmation that says what
 * changes and what does not.
 */
const VersionHistory = ({ history, className }: VersionHistoryProps) => {
  const { mutateAsync: rollback, isPending: isRollingBack } = useSchemaRollback();
  const [isOpen, setIsOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const confirmRollback = async () => {
    if (rollbackTarget === null) return;
    try {
      const res = await rollback(rollbackTarget);
      if (res.isSuccess) {
        showSuccessToast({ description: `Version ${rollbackTarget} is live` });
        setRollbackTarget(null);
        setIsOpen(false);
        return;
      }
      showErrorToast({ errors: "Something went wrong" });
    } catch (error) {
      showErrorToast({ errors: isErrorWithErrors(error) ? error.errors : error });
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Version history"
            title="Version history"
            className={cn(
              "flex w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
              className,
            )}
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <div className="px-3 py-2.5 text-sm font-medium">Version history</div>
          {history.versions.length === 0 ? (
            <p className="border-t border-border/50 px-3 py-3 text-xs text-muted-foreground">
              Nothing is published yet. Publishing creates the first version.
            </p>
          ) : (
            <ul>
              {history.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex items-center gap-2.5 border-t border-border/50 px-3 py-2 text-xs"
                >
                  <span className="min-w-[2.25rem] font-mono">v{version.version}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {describeVersion(version)}
                  </span>
                  {version.isCurrent ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/20 dark:text-green-400">
                      Live
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRollbackTarget(version.version)}
                      className="rounded-md border border-border px-2 py-0.5 font-medium transition-colors hover:bg-muted"
                    >
                      Roll back
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            The last 10 published versions are kept.
          </p>
        </PopoverContent>
      </Popover>

      <Dialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
      >
        {rollbackTarget !== null && (
          <ConfirmationModal
            data={{
              dialogTitle: `Roll back to version ${rollbackTarget}?`,
              dialogSubtitle: (
                <>
                  <span className="block">
                    {`Every server switches from v${history.currentVersion} to v${rollbackTarget} within about a second. Apps using the API see v${rollbackTarget}'s schemas and access rules.`}
                  </span>
                  <span className="mt-2 block">
                    {"Your drafts don't change. Publishing again creates a new version from them."}
                  </span>
                </>
              ),
              confirmButton: isRollingBack ? "Rolling back…" : "Roll back",
            }}
            onCancel={() => setRollbackTarget(null)}
            onConfirm={confirmRollback}
            buttonState={{ confirm: { disable: isRollingBack } }}
          />
        )}
      </Dialog>
    </>
  );
};
