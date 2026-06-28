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
import { InfoCard } from "./info-card";
import { SchemaBasicInfoSkeleton } from "./schema-basic-info-skeleton";
import SchemaAccessControlDrawer from "./schema-access-control-drawer";
import {
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_TYPES,
} from "../constants/schema-access-control";
import { ISchemaDetails } from "../models/data-service";
import { useDeleteSchema } from "../hooks/use-configuration";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { cn } from "@/lib/utils";
import { Database, MoreVertical, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface SchemaBasicInfoProps extends ISchemaDetails {
  onDeleteSuccess?: () => void;
  isLoading?: boolean;
}

const ACCESS_PILL: Record<string, { label: string; className: string }> = {
  [ACCESS_TYPES.LOGGED_IN]: {
    label: "Logged-in users",
    className: "bg-amber-500/10 text-amber-300/80 border border-amber-500/20",
  },
  [ACCESS_TYPES.PUBLIC]: {
    label: "Public",
    className: "bg-rose-500/10 text-rose-300/80 border border-rose-500/20",
  },
  [ACCESS_TYPES.CUSTOM]: {
    label: "Custom",
    className: "bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20",
  },
  [ACCESS_TYPES.INHERITED]: {
    label: "Inherited",
    className: "bg-muted/60 text-muted-foreground/80 border border-border/40",
  },
};

const ACCESS_ACTIONS = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
] as const;

export const SchemaBasicInfo = ({
  onDeleteSuccess,
  isLoading,
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Database className="h-4 w-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              {schemaName}
            </h2>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary/70 ring-1 ring-primary/20">
              {schemaType}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isEntity && (
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
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Schema Access
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
          <div className="relative flex items-start gap-4 border-t border-border/40 px-5 py-3">
            <span className="shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {isEntity ? "Access Control" : "References"}
            </span>
            {isEntity ? (
              /* Access Control pills for Entity */
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {accessLevels.map(({ label, level }) => {
                  const accessType =
                    ACCESS_LEVEL_TO_TYPE[level] ?? ACCESS_TYPES.LOGGED_IN;
                  const pill = ACCESS_PILL[accessType];
                  return (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground/70">
                        {label}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex cursor-pointer items-center rounded-lg px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-75",
                          pill?.className,
                        )}
                        onClick={() => {
                          setIsSchemaAccessControlDrawerOpen(true);
                          setSelectedTab(label);
                        }}
                      >
                        {pill?.label}
                      </button>
                    </div>
                  );
                })}
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

export default SchemaBasicInfo;
