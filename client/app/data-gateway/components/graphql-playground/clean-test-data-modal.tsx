"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import {
  useDeleteMockData,
  useGetMockData,
} from "@/data-gateway/hooks/use-configuration";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { Loader, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface CleanTestDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CleanTestDataModal = ({
  open,
  onOpenChange,
}: CleanTestDataModalProps) => {
  const selectedProject = useProjectStore().selectedProject;
  const projectKey = selectedProject?.tenantId || "";

  const { data: mockDataResponse, isLoading, refetch } = useGetMockData();
  const { mutateAsync: deleteMockData, isPending: isDeleting } =
    useDeleteMockData();

  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const mockDataItems = mockDataResponse?.data?.items || [];

  // Refetch data when modal opens
  useEffect(() => {
    if (open) {
      refetch();
      setSelectedSchemas([]);
      setSelectAll(false);
    }
  }, [open, refetch]);

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedSchemas(mockDataItems.map((item) => item.schemaName));
    } else {
      setSelectedSchemas([]);
    }
  };

  // Handle individual selection
  const handleSelectSchema = (schemaName: string, checked: boolean) => {
    if (checked) {
      setSelectedSchemas([...selectedSchemas, schemaName]);
    } else {
      setSelectedSchemas(selectedSchemas.filter((name) => name !== schemaName));
      setSelectAll(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    try {
      await deleteMockData({
        projectKey,
        schemaNames: selectedSchemas,
      });

      showSuccessToast({
        description: `Successfully deleted test data for ${selectedSchemas.length} schema(s)`,
      });

      // Reset selections and close modal
      setSelectedSchemas([]);
      setSelectAll(false);
      onOpenChange(false);
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-sm border border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trash2 className="h-4 w-4 text-indigo-400" />
            Clean Test Data
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            Select schemas to delete their test data
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[380px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : mockDataItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground/50">
              No test data found
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All */}
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all" className="flex-1 cursor-pointer text-xs font-medium text-muted-foreground/70">
                  Select All ({mockDataItems.length})
                </label>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 gap-2">
                {mockDataItems.map((item) => (
                  <label
                    key={item.schemaName}
                    htmlFor={item.schemaName}
                    className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-border/30 bg-muted/10 p-3 transition-colors hover:border-border/50 hover:bg-muted/20"
                  >
                    <Checkbox
                      id={item.schemaName}
                      checked={selectedSchemas.includes(item.schemaName)}
                      onCheckedChange={(checked) =>
                        handleSelectSchema(item.schemaName, checked as boolean)
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-xs font-medium text-foreground/80">
                      {item.collectionName}
                      <span className="ml-1 text-muted-foreground/50">
                        ({item.count} {item.count === 1 ? "record" : "records"})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="border border-border/40 text-muted-foreground/70 hover:text-foreground"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting || selectedSchemas.length === 0}
            className="gap-1.5 bg-rose-600/90 text-white shadow-[0_0_12px_-2px_rgba(225,29,72,0.4)] hover:bg-rose-600 hover:shadow-[0_0_16px_-2px_rgba(225,29,72,0.5)] disabled:opacity-40"
          >
            {isDeleting ? (
              <>
                <Loader className="h-3.5 w-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
