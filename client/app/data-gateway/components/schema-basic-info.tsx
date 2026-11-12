"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Badge } from "@/components/ui-kits/badge/badge";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { cn } from "@/lib/utils";
import { InfoCard } from "./info-card";
import { SchemaBasicInfoSkeleton } from "./schema-basic-info-skeleton";
import SchemaAccessControlDrawer from "./schema-access-control-drawer";
import { AccessVerbPill } from "./primitives";
import { readonlyPropertyNames } from "../constants/input-restrictions";
import { ISchemaDetails } from "../models/data-service";
import { useDeleteSchema, usePendingSchemaIds, useSchemaIndexes } from "../hooks/use-configuration";
import { useNarrowContainer } from "../hooks/use-narrow-container";
import { SCHEMA_LIVE_STATE_LABELS, schemaLiveState } from "../utils/schema-live-state";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { CloudOff, CloudUpload, Database, Eye, MoreVertical, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { tStatic, useT } from "@seliseblocks/genesis-os/i18n";

const SCHEMA_BASIC_INFO_SCHEMA_ACCESS = "SCHEMA_BASIC_INFO.SCHEMA_ACCESS";

/** Below this width the header can no longer fit Preview + Schema Access +
 *  the ACCESS CONTROL pills' text on one line — matters most once the access
 *  inspector opens beside this panel and eats into its width. */
const NARROW_HEADER_WIDTH = 560;

interface SchemaBasicInfoProps extends ISchemaDetails {
  onDeleteSuccess?: () => void;
  isLoading?: boolean;
  /**
   * Show schema access in a docked inspector rather than the drawer. The tab
   * is the pill that was clicked, so the inspector opens on that verb.
   */
  onOpenSchemaAccess?: (tab: string) => void;
  /** Opens the schema preview drawer — moved here from the field table's own
   * header so it sits beside Schema Access instead of down by the tabs. Folds
   * into the "⋮" menu (next to Delete schema) once the header is too narrow
   * to hold it as its own button, or as soon as the access inspector opens
   * at all — see `isAccessPanelOpen`. */
  onOpenPreview?: () => void;
  /**
   * True while the docked access inspector is open. The inspector panel eats
   * into this panel's width, but not always past `NARROW_HEADER_WIDTH` — the
   * ACCESS CONTROL pills compact to icon-only tier chips, and Preview folds
   * into the "⋮" menu, as soon as the inspector opens at all, rather than
   * waiting for a specific pixel width.
   */
  isAccessPanelOpen?: boolean;
}

/**
 * "3 fields · 5 system · 2 indexes". Entity schemas split into system defaults and the ones you
 * added; Child schemas carry no system split and have no Indexes tab, so there is nothing to add.
 */
const schemaFieldsSummary = (
  fields: SchemaBasicInfoProps["fields"],
  isEntity: boolean,
  indexCount: number | undefined,
  systemLabel: (systemFieldsCount: number) => string,
): string => {
  const customFieldsCount = isEntity
    ? fields.filter((f) => !readonlyPropertyNames.includes(f.name)).length
    : fields.length;
  const systemFieldsCount = isEntity
    ? fields.filter((f) => readonlyPropertyNames.includes(f.name)).length
    : 0;
  const parts = [tStatic("data.gateway.schema", "SCHEMA_BASIC_INFO.FIELD_COUNT", { count: customFieldsCount })];
  if (isEntity) parts.push(systemLabel(systemFieldsCount));
  if (isEntity && indexCount !== undefined) parts.push(tStatic("data.gateway.schema", "SCHEMA_BASIC_INFO.INDEX_COUNT", { count: indexCount }));
  return parts.join(" · ");
};

export const SchemaBasicInfo = ({
  onDeleteSuccess,
  isLoading,
  onOpenSchemaAccess,
  onOpenPreview,
  isAccessPanelOpen = false,
  ...props
}: SchemaBasicInfoProps) => {
  const { t } = useT("data.gateway.schema");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSchemaAccessControlDrawerOpen, setIsSchemaAccessControlDrawerOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("");
  const { ref: headerRef, isNarrow } = useNarrowContainer<HTMLDivElement>(NARROW_HEADER_WIDTH);
  // Preview folds into the "⋮" menu the same moment the pills go icon-only —
  // as soon as the access inspector opens at all, not only once the header
  // itself crosses the pixel threshold.
  const foldPreviewIntoMenu = isNarrow || isAccessPanelOpen;

  const { isPending: isDeleteSchemaPending, mutateAsync: deleteAsync } = useDeleteSchema();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const pendingSchemaIds = usePendingSchemaIds(projectKey);
  const liveState = schemaLiveState(props, pendingSchemaIds);

  const onConfirmDelete = async () => {
    try {
      const res = await deleteAsync({ id: props.id, projectKey });
      if (res?.isSuccess) {
        toast({ variant: "success", title: t("common:SUCCESS"), description: t("SCHEMA_BASIC_INFO.DELETED_SUCCESSFULLY") });
        setIsDeleteDialogOpen(false);
        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
      } else {
        toast({ variant: "destructive", title: t("common:ERROR"), description: JSON.stringify(res?.errors) });
      }
    } catch (error) {
      toast({ variant: "destructive", title: t("common:ERROR"), description: JSON.stringify(error) });
    }
  };

  const { schemaName } = props;
  const schemaType = props.schemaType === 1 ? "Entity" : "Child";
  const isEntity = schemaType === "Entity";

  // Reuses the Indexes tab's own cache entry — opening that tab later reads
  // the same query rather than starting a second one.
  const { data: indexesQuery } = useSchemaIndexes(props.id, {
    enabled: isEntity && Boolean(props.id),
  });
  const indexCount = indexesQuery?.data?.indexes.length;

  const fieldsSummary = schemaFieldsSummary(props.fields, isEntity, indexCount, (systemFieldsCount) =>
    t("SCHEMA_BASIC_INFO.SYSTEMFIELDSCOUNT_SYSTEM", { systemFieldsCount }),
  );

  const accessLevels = [
    { label: t("common:VIEW"), level: props.readAccessLevel },
    { label: t("common:CREATE"), level: props.writeAccessLevel },
    { label: t("common:EDIT"), level: props.editAccessLevel },
    { label: t("common:DELETE"), level: props.deleteAccessLevel },
  ] as const;

  if (isLoading) return <SchemaBasicInfoSkeleton />;

  if (!schemaName) {
    return (
      <InfoCard
        title={t("SCHEMA_BASIC_INFO.BASIC_INFORMATION")}
        message={t("SCHEMA_BASIC_INFO.SELECT_A_SCHEMA_FROM_THE_SIDEBAR")}
      />
    );
  }

  return (
    <>
      <div
        ref={headerRef}
        className="relative overflow-hidden rounded-t-sm border border-b-0 border-border/40 bg-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.04),transparent_60%)]" />
        {/* Header */}
        {/* The actions stay pinned top-right; only the name and summary wrap.
            Letting the row itself wrap dropped them onto a line of their own
            under the icon on narrow widths. */}
        <div className="relative flex items-start justify-between gap-3 px-3 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-break-word text-sm font-semibold text-foreground">
                  {schemaName}
                </h2>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    isEntity ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {schemaType}
                </span>
                {liveState === "not-live" && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning-500/50 bg-warning-100 px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-warning-800">
                    <CloudOff className="h-3 w-3" aria-hidden />
                    {SCHEMA_LIVE_STATE_LABELS["not-live"]}
                  </span>
                )}
                {liveState === "unpublished" && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning-800">
                    <CloudUpload className="h-3 w-3 text-warning-500" aria-hidden />
                    {SCHEMA_LIVE_STATE_LABELS.unpublished}
                  </span>
                )}
              </div>
              {/* The schema's description (section 7), as plain text. */}
              {props.description && <p className="wrap-break-word text-[12px] text-muted-foreground">{props.description}</p>}
              {/* Narrow: collection and counts stack on two lines, without the
                  dot, which a wrapping line would leave dangling at its end. */}
              <div
                className={cn(
                  "flex text-[11px] text-muted-foreground/60",
                  isNarrow ? "flex-col items-start gap-0.5" : "flex-wrap items-center gap-1.5",
                )}
              >
                {props.collectionName && (
                  <>
                    <span className="break-all font-mono">{props.collectionName}</span>
                    {!isNarrow && (
                      <span
                        aria-hidden
                        className="h-[3px] w-[3px] shrink-0 rounded-full bg-current opacity-50"
                      />
                    )}
                  </>
                )}
                <span>{fieldsSummary}</span>
              </div>
              {liveState && (
                <p className="text-[11px] text-warning-800">
                  {liveState === "not-live"
                    ? t("SCHEMA_BASIC_INFO.NOT_IN_THE_LIVE_VERSION_APPS")
                    : t("SCHEMA_BASIC_INFO.THE_LIVE_VERSION_DOESN_T_INCLUDE")}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenPreview && !foldPreviewIntoMenu && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onOpenPreview}>
                <Eye className="h-3.5 w-3.5" />
                {t("SCHEMA_BASIC_INFO.PREVIEW")}
              </Button>
            )}
            {isEntity && onOpenSchemaAccess && (
              <Button
                variant="outline"
                size="sm"
                aria-label={t(SCHEMA_BASIC_INFO_SCHEMA_ACCESS)}
                className={cn(
                  "h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                  isNarrow && "w-8 px-0",
                )}
                onClick={() => onOpenSchemaAccess("View")}
              >
                <Shield className="h-3.5 w-3.5" />
                {!isNarrow && t(SCHEMA_BASIC_INFO_SCHEMA_ACCESS)}
              </Button>
            )}
            {isEntity && !onOpenSchemaAccess && (
              <SchemaAccessControlDrawer
                fields={props.fields}
                schemaName={schemaName}
                schemaId={props.id}
                level="row"
                readAccessLevel={props.readAccessLevel}
                writeAccessLevel={props.writeAccessLevel}
                editAccessLevel={props.editAccessLevel}
                deleteAccessLevel={props.deleteAccessLevel}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t(SCHEMA_BASIC_INFO_SCHEMA_ACCESS)}
                    className={cn(
                      "h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                      isNarrow && "w-8 px-0",
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    {!isNarrow && t(SCHEMA_BASIC_INFO_SCHEMA_ACCESS)}
                  </Button>
                }
                open={isSchemaAccessControlDrawerOpen}
                onOpenChange={setIsSchemaAccessControlDrawerOpen}
                selectedTab={selectedTab}
              />
            )}
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={t("SCHEMA_BASIC_INFO.MORE_OPTIONS")}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onOpenPreview && foldPreviewIntoMenu && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      setIsDropdownOpen(false);
                      onOpenPreview();
                    }}
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    {t("SCHEMA_BASIC_INFO.PREVIEW")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => {
                    setIsDropdownOpen(false);
                    requestAnimationFrame(() => setIsDeleteDialogOpen(true));
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {t("SCHEMA_BASIC_INFO.DELETE_SCHEMA")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bottom info row — Access Control for Entity, References for Child */}
        {(isEntity || props.schemaType === 2) && (
          /* On phones the label stacks above its values rather than sitting
             beside them, where it ran off the card's left edge. */
          <div className="relative flex flex-col items-start gap-2.5 border-t border-border/40 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {isEntity ? t("SCHEMA_BASIC_INFO.ACCESS_CONTROL") : t("SCHEMA_BASIC_INFO.REFERENCES")}
            </span>
            {isEntity ? (
              /* Access Control pills for Entity — verb and tier share one
                 bordered, tier-tinted pill, matching every board's own strip.
                 Two per row on phones (View | Create, Edit | Delete). */
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                {accessLevels.map(({ label, level }) => (
                  <AccessVerbPill
                    key={label}
                    verb={label}
                    level={level}
                    className="justify-center sm:justify-start"
                    compact={isNarrow || isAccessPanelOpen}
                    onClick={() => {
                      if (onOpenSchemaAccess) {
                        onOpenSchemaAccess(label);
                        return;
                      }
                      setIsSchemaAccessControlDrawerOpen(true);
                      setSelectedTab(label);
                    }}
                  />
                ))}
              </div>
            ) : (
              /* References for Child */
              <div className="flex flex-wrap items-center gap-2">
                {props.schemaReferences?.length > 0 ? (
                  props.schemaReferences.map((item, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground/50">{t("SCHEMA_BASIC_INFO.NO_REFERENCES")}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={onConfirmDelete}
          data={{
            dialogTitle: t("SCHEMA_BASIC_INFO.DELETE_SCHEMA_2"),
            dialogSubtitle: t("SCHEMA_BASIC_INFO.ARE_YOU_SURE_YOU_WANT_TO"),
            confirmButton: t("common:DELETE"),
            cancelButton: t("common:CANCEL"),
          }}
          buttonState={{ confirm: { disable: isDeleteSchemaPending } }}
        />
      </Dialog>
    </>
  );
};

// DEADCODE 2026-07-29: default export has no importers (all consumers use the named export); commented pending review
// export default SchemaBasicInfo;
