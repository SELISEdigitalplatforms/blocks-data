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
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";
const PUBLISH_CONTROL_VERSION_HISTORY = "PUBLISH_CONTROL.VERSION_HISTORY";

type PublishState = "clean" | "pending" | "publishing" | "failed";

const formatPublishedDate = (value: string) => {
  const date = new Date(value);
  if (isToday(date)) return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "PUBLISH_CONTROL.TODAY_FORMAT", { format: format(date, "HH:mm") });
  return format(date, isThisYear(date) ? "d MMM" : "d MMM yyyy");
};

const describeVersion = (version: ISchemaVersionSummary) => {
  const date = formatPublishedDate(version.publishedDate);
  if (version.kind === "Bootstrap") return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "PUBLISH_CONTROL.DATE_FIRST_VERSION_FROM_DRAFTS", { date });
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
 * version history, where an earlier version can be made live again. History is fetched only when
 * opened; failed reads leave publishing available.
 */
const publishStateOf = (isPublishing: boolean, hasFailed: boolean, pendingCount: number): PublishState => {
  if (isPublishing) return "publishing";
  if (hasFailed) return "failed";
  return pendingCount > 0 ? "pending" : "clean";
};

export const PublishControl = () => {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { data: unadaptedChangeLogs } = useGetUnadaptedChangeLogs({ projectKey });
  const { mutateAsync: reloadSchemas, isPending: isPublishing } = useSchemasReload();
  const [historyRequested, setHistoryRequested] = useState(false);
  const { data: historyResponse, isError: historyError } = useSchemaVersionHistory({ projectKey, enabled: historyRequested });
  const [hasFailed, setHasFailed] = useState(false);

  const pendingCount = unadaptedChangeLogs?.data?.length ?? 0;
  const history = historyResponse?.isSuccess ? historyResponse.data : null;
  // Only a version that is in the history is shown: until a tenant's first
  // published version exists, there is nothing to name.
  const liveVersion = history?.versions.some((v) => v.isCurrent) ? history.currentVersion : null;

  const state = publishStateOf(isPublishing, hasFailed, pendingCount);

  const publish = async () => {
    setHasFailed(false);
    try {
      const res = await reloadSchemas();
      if (res.isSuccess) {
        showSuccessToast({ description: t("PUBLISH_CONTROL.SCHEMAS_PUBLISHED_SUCCESSFULLY") });
        return;
      }
      setHasFailed(true);
      showErrorToast({ errors: t("PUBLISH_CONTROL.SOMETHING_WENT_WRONG") });
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
          aria-label={t("PUBLISH_CONTROL.PUBLISH")}
          title={t("PUBLISH_CONTROL.EVERYTHING_IS_PUBLISHED_PUBLISHING")}
          className="flex items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">
            {t("PUBLISH_CONTROL.PUBLISHED")}{liveVersion !== null && ` · v${liveVersion}`}
          </span>
        </button>
        <VersionHistory history={history} onOpenChange={setHistoryRequested} isError={historyError} className="border-l border-border/50" />
      </div>
    );
  }

  const failed = state === "failed";
  let statusText = t("PUBLISH_CONTROL.PENDINGCOUNT_UNPUBLISHED", { pendingCount });
  if (failed) statusText = t("PUBLISH_CONTROL.PUBLISH_FAILED");
  else if (state === "publishing") statusText = "Publishing…";

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
            {statusText}
            {!failed && state !== "publishing" && liveVersion !== null && (
              <span className="hidden lg:inline"> {t("PUBLISH_CONTROL.LIVE_V_LIVEVERSION", { liveVersion })}</span>
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
          {failed ? t("common:RETRY") : t("PUBLISH_CONTROL.PUBLISH")}
        </button>
      </div>

      <VersionHistory history={history} onOpenChange={setHistoryRequested} isError={historyError} className="h-8 rounded-lg border border-border/50" />
    </div>
  );
};

interface VersionHistoryProps {
  history: { currentVersion: number; versions: ISchemaVersionSummary[] } | null;
  onOpenChange: (open: boolean) => void;
  isError?: boolean;
  className?: string;
}

/**
 * The kept published versions, newest first, with the live one marked. Any
 * other version can be made live again after a confirmation that says what
 * changes and what does not.
 */
const VersionHistory = ({ history, className, onOpenChange, isError }: VersionHistoryProps) => {
  const { t } = useT(DATA_GATEWAY_SCHEMA_MODULE);
  const { mutateAsync: rollback, isPending: isRollingBack } = useSchemaRollback();
  const [isOpen, setIsOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const confirmRollback = async () => {
    if (rollbackTarget === null) return;
    try {
      const res = await rollback(rollbackTarget);
      if (res.isSuccess) {
        showSuccessToast({ description: t("PUBLISH_CONTROL.VERSION_ROLLBACKTARGET_IS_LIVE", { rollbackTarget }) });
        setRollbackTarget(null);
        setIsOpen(false);
        return;
      }
      showErrorToast({ errors: t("PUBLISH_CONTROL.SOMETHING_WENT_WRONG") });
    } catch (error) {
      showErrorToast({ errors: isErrorWithErrors(error) ? error.errors : error });
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); onOpenChange(open); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t(PUBLISH_CONTROL_VERSION_HISTORY)}
            title={t(PUBLISH_CONTROL_VERSION_HISTORY)}
            className={cn(
              "flex w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
              className,
            )}
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <div className="px-3 py-2.5 text-sm font-medium">{t(PUBLISH_CONTROL_VERSION_HISTORY)}</div>
          {!history && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {isError ? t("PUBLISH_CONTROL.VERSION_HISTORY_IS_UNAVAILABLE") : t("PUBLISH_CONTROL.LOADING_VERSION_HISTORY")}
            </p>
          )}
          {history && history.versions.length === 0 && (
            <p className="border-t border-border/50 px-3 py-3 text-xs text-muted-foreground">
              {t("PUBLISH_CONTROL.NOTHING_IS_PUBLISHED_YET_PUBLISHING")}
            </p>
          )}
          {history && history.versions.length !== 0 && (
            <ul>
              {history.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex items-center gap-2.5 border-t border-border/50 px-3 py-2 text-xs"
                >
                  <span className="min-w-9 font-mono">v{version.version}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {describeVersion(version)}
                  </span>
                  {version.isCurrent ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/20 dark:text-green-400">
                      {t("PUBLISH_CONTROL.LIVE")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRollbackTarget(version.version)}
                      className="rounded-md border border-border px-2 py-0.5 font-medium transition-colors hover:bg-muted"
                    >
                      {t("PUBLISH_CONTROL.ROLL_BACK")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            {t("PUBLISH_CONTROL.THE_LAST_10_PUBLISHED_VERSIONS_ARE")}
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
              dialogTitle: t("PUBLISH_CONTROL.ROLL_BACK_TO_VERSION_ROLLBACKTARGET", { rollbackTarget }),
              dialogSubtitle: (
                <>
                  <span className="block">
                    {t("PUBLISH_CONTROL.EVERY_SERVER_SWITCHES_FROM_V", { currentVersion: history?.currentVersion ?? "", rollbackTarget })}
                  </span>
                  <span className="mt-2 block">
                    {t("PUBLISH_CONTROL.YOUR_DRAFTS_DON_T_CHANGE_CHANGES")}
                  </span>
                </>
              ),
              confirmButton: isRollingBack ? t("PUBLISH_CONTROL.ROLLING_BACK") : t("PUBLISH_CONTROL.ROLL_BACK"),
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
