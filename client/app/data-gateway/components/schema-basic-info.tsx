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
import { useDeleteSchema, useSchemaIndexes } from "../hooks/use-configuration";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { Database, MoreVertical, Shield } from "lucide-react";
import { useState } from "react";

interface SchemaBasicInfoProps extends ISchemaDetails {
  onDeleteSuccess?: () => void;
  isLoading?: boolean;
  /**
   * Show schema access in a docked inspector rather than the drawer. The tab
   * is the pill that was clicked, so the inspector opens on that verb.
   */
  onOpenSchemaAccess?: (tab: string) => void;
}

export const SchemaBasicInfo = ({
  onDeleteSuccess,
  isLoading,
  onOpenSchemaAccess,
  ...props
}: SchemaBasicInfoProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSchemaAccessControlDrawerOpen, setIsSchemaAccessControlDrawerOpen] =
    useState(false);
  const [selectedTab, setSelectedTab] = useState("");

  const { isPending: isDeleteSchemaPending, mutateAsync: deleteAsync } =
    useDeleteSchema();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const onConfirmDelete = async () => {
    try {
      const res = await deleteAsync({ id: props.id, projectKey });
      if (res?.isSuccess) {
        toast({ variant: "success", title: "Success", description: "Deleted successfully" });
        setIsDeleteDialogOpen(false);
        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
      } else {
        toast({ variant: "destructive", title: "Error", description: JSON.stringify(res?.errors) });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: JSON.stringify(error) });
    }
  };

  const { schemaName } = props;
  const schemaType = props.schemaType === 1 ? "Entity" : "Child";
  const isEntity = schemaType === "Entity";

  // Entity schemas split into system defaults and the ones you added; Child
  // schemas carry no system split and have no Indexes tab, so there is
  // nothing to add to their count.
  const customFieldsCount = isEntity
    ? props.fields.filter((f) => !readonlyPropertyNames.includes(f.name)).length
    : props.fields.length;
  const systemFieldsCount = isEntity
    ? props.fields.filter((f) => readonlyPropertyNames.includes(f.name)).length
    : 0;
  // Reuses the Indexes tab's own cache entry — opening that tab later reads
  // the same query rather than starting a second one.
  const { data: indexesQuery } = useSchemaIndexes(props.id, {
    enabled: isEntity && Boolean(props.id),
  });
  const indexCount = indexesQuery?.data?.indexes.length;

  const fieldsSummary = [
    `${customFieldsCount} ${customFieldsCount === 1 ? "field" : "fields"}`,
    isEntity ? `${systemFieldsCount} system` : null,
    isEntity && indexCount !== undefined
      ? `${indexCount} ${indexCount === 1 ? "index" : "indexes"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const accessLevels = [
    { label: "View", level: props.readAccessLevel },
    { label: "Create", level: props.writeAccessLevel },
    { label: "Edit", level: props.editAccessLevel },
    { label: "Delete", level: props.deleteAccessLevel },
  ] as const;

  if (isLoading) return <SchemaBasicInfoSkeleton />;

  if (!schemaName) {
    return (
      <InfoCard
        title="Basic Information"
        message="Select a schema from the sidebar to view its details."
      />
    );
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-sm border border-border/40 bg-card">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.04),transparent_60%)]" />
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
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
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/60">
                {props.collectionName && (
                  <>
                    <span className="font-mono">{props.collectionName}</span>
                    <span
                      aria-hidden
                      className="h-[3px] w-[3px] shrink-0 rounded-full bg-current opacity-50"
                    />
                  </>
                )}
                <span>{fieldsSummary}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isEntity && onOpenSchemaAccess ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                onClick={() => onOpenSchemaAccess("View")}
              >
                <Shield className="h-3.5 w-3.5" />
                Schema Access
              </Button>
            ) : isEntity ? (
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
                    className="h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Schema Access
                  </Button>
                }
                open={isSchemaAccessControlDrawerOpen}
                onOpenChange={setIsSchemaAccessControlDrawerOpen}
                selectedTab={selectedTab}
              />
            ) : null}
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => {
                    setIsDropdownOpen(false);
                    requestAnimationFrame(() => setIsDeleteDialogOpen(true));
                  }}
                >
                  Delete schema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bottom info row — Access Control for Entity, References for Child */}
        {(isEntity || props.schemaType === 2) && (
          <div className="relative flex items-center gap-4 border-t border-border/40 px-5 py-3">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {isEntity ? "Access Control" : "References"}
            </span>
            {isEntity ? (
              /* Access Control pills for Entity — verb and tier share one
                 bordered, tier-tinted pill, matching every board's own strip. */
              <div className="flex flex-wrap items-center gap-2">
                {accessLevels.map(({ label, level }) => (
                  <AccessVerbPill
                    key={label}
                    verb={label}
                    level={level}
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
                  <span className="text-xs text-muted-foreground/50">
                    No references
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={onConfirmDelete}
          data={{
            dialogTitle: "Delete schema?",
            dialogSubtitle: "Are you sure you want to delete this schema?",
            confirmButton: "Delete",
            cancelButton: "Cancel",
          }}
          buttonState={{ confirm: { disable: isDeleteSchemaPending } }}
        />
      </Dialog>
    </>
  );
};

// DEADCODE 2026-07-29: default export has no importers (all consumers use the named export); commented pending review
// export default SchemaBasicInfo;
