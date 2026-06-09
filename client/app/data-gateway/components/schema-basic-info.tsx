import { Button } from "@/components/ui-kits/button/button";
import { Card, CardContent } from "@/components/ui-kits/card/card";
import { useState } from "react";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { ISchemaDetails } from "../models/data-service";
import { useDeleteSchema } from "../hooks/use-configuration";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { InfoCard } from "./info-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui-kits/badge/badge";
import { SchemaBasicInfoSkeleton } from "./schema-basic-info-skeleton";
import SchemaAccessControlDrawer from "./schema-access-control-drawer";
import {
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_TYPE_BADGE_STYLES,
  ACCESS_TYPE_SHORT_LABELS,
  ACCESS_TYPES,
} from "../constants/schema-access-control";
import { cn } from "@/lib/utils";

interface SchemaBasicInfoProps extends ISchemaDetails {
  onDeleteSuccess?: () => void;
  isLoading?: boolean;
}

export const SchemaBasicInfo = ({
  onDeleteSuccess,
  isLoading,
  ...props
}: SchemaBasicInfoProps) => {
  // State Management
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSchemaAccessControlDrawerOpen, setIsSchemaAccessControlDrawerOpen] =
    useState<boolean>(false);
  const [selectedTab, setSelectedTab] = useState<string>("");

  // Hooks
  const { isPending: isDeleteSchemaPending, mutateAsync: deleteAsync } =
    useDeleteSchema();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  // Delete Confirmation Modal Configuration
  const deleteSchemaModalData = {
    dialogTitle: "Delete schema?",
    dialogSubtitle: "Are you sure you want to delete this schema?",
    confirmButton: "Delete",
    cancelButton: "Cancel",
  };

  // Handler: Delete Schema
  const onConfirmDelete = async () => {
    try {
      const payload = {
        id: props.id,
        projectKey,
      };

      const res = await deleteAsync(payload);

      if (res?.isSuccess) {
        toast({
          variant: "success",
          title: "Success",
          description: "Deleted successfully",
        });
        setIsDeleteDialogOpen(false);
        onDeleteSuccess?.();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: JSON.stringify(res?.errors),
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: JSON.stringify(error),
      });
    }
  };

  const { schemaName } = props;
  const schemaType = props.schemaType === 1 ? "Entity" : "DTO";

  // Render - Loading State
  if (isLoading) {
    return <SchemaBasicInfoSkeleton />;
  }

  // Render
  return schemaName !== "" ? (
    <>
      <Card className="mb-4 shadow-none xl:h-[148px] xl:overflow-hidden">
        <CardContent className="flex flex-col items-start justify-between gap-2">
          {/* Header Section */}
          <div className="flex w-full flex-row items-center justify-between">
            <h2 className="mb-2 text-lg font-semibold">Basic Information</h2>

            {/* Action Buttons */}
            <div className="flex flex-row items-center gap-4">
              {schemaType === "Entity" && (
                <SchemaAccessControlDrawer
                  fields={props.fields}
                  schemaName={schemaName}
                  schemaId={props.id}
                  level="row"
                  readAccessLevel={props.readAccessLevel}
                  writeAccessLevel={props.writeAccessLevel}
                  editAccessLevel={props.editAccessLevel}
                  deleteAccessLevel={props.deleteAccessLevel}
                  trigger={<Button variant="outline">Schema Access</Button>}
                  open={isSchemaAccessControlDrawerOpen}
                  onOpenChange={setIsSchemaAccessControlDrawerOpen}
                  selectedTab={selectedTab}
                />
              )}

              {/* More Options Dropdown */}
              <DropdownMenu
                open={isDropdownOpen}
                onOpenChange={setIsDropdownOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    size="default"
                    variant="outline"
                    className="gap-2 rounded shadow-none hover:bg-slate-100 dark:hover:bg-gray-800"
                    aria-label="More options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-none">
                  {/* Delete Option */}
                  <DropdownMenuItem
                    className="cursor-pointer text-red-500 focus:text-red-500"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <span className="text-red-500">Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Schema Details Section */}
          <div className="flex w-full flex-col gap-4 text-muted-foreground xl:flex-row">
            <div className="flex shrink-0 flex-col gap-1 xl:w-1/4">
              <span>Schema Name</span>
              <span className="font-medium text-foreground">{schemaName}</span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 xl:w-1/4">
              <span>Schema Type</span>
              <span className="font-medium text-foreground">
                {schemaType === "Entity" ? schemaType : "Child"}
              </span>
            </div>
            {props.schemaType === 2 && (
              <div className="flex flex-col gap-1 xl:w-1/2">
                <span>Reference</span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {props.schemaReferences?.length > 0 ? (
                    props.schemaReferences.map((item, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="shrink-0"
                      >
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
              </div>
            )}
            {schemaType === "Entity" && (
              <div className="flex flex-col gap-1 xl:w-1/2">
                <span>Access Control</span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {(
                    [
                      { label: "View", level: props.readAccessLevel },
                      { label: "Create", level: props.writeAccessLevel },
                      { label: "Edit", level: props.editAccessLevel },
                      { label: "Delete", level: props.deleteAccessLevel },
                    ] as const
                  ).map(({ label, level }) => {
                    const accessType = level
                      ? ACCESS_LEVEL_TO_TYPE[level]
                      : ACCESS_TYPES.LOGGED_IN;
                    return (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {label}:
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                            ACCESS_TYPE_BADGE_STYLES[accessType],
                          )}
                        >
                          <button
                            onClick={() => {
                              setIsSchemaAccessControlDrawerOpen(true);
                              setSelectedTab(label);
                            }}
                          >
                            {ACCESS_TYPE_SHORT_LABELS[accessType]}
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={onConfirmDelete}
          data={deleteSchemaModalData}
          buttonState={{ confirm: { disable: isDeleteSchemaPending } }}
        />
      </Dialog>
    </>
  ) : (
    <InfoCard
      title="Basic Information"
      message="Select a schema from the sidebar to view its details."
    />
  );
};

export default SchemaBasicInfo;
