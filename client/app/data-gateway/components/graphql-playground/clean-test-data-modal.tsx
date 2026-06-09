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
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { Loader } from "lucide-react";
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clean Test Data</DialogTitle>
          <DialogDescription>
            Select schemas to delete their test data
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mockDataItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No test data found
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All */}
              <div className="flex items-center space-x-2 border-b pb-2">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <label
                  htmlFor="select-all"
                  className="flex-1 cursor-pointer text-sm font-medium"
                >
                  Select All ({mockDataItems.length})
                </label>
              </div>

              {/* Individual Items - Two Column Grid */}
              <div className="grid grid-cols-2 gap-3">
                {mockDataItems.map((item) => (
                  <div
                    key={item.schemaName}
                    className="flex flex-col space-y-1 rounded-md border p-3 hover:bg-accent/50"
                  >
                    <div className="flex items-start space-x-2">
                      <Checkbox
                        id={item.schemaName}
                        checked={selectedSchemas.includes(item.schemaName)}
                        onCheckedChange={(checked) =>
                          handleSelectSchema(
                            item.schemaName,
                            checked as boolean,
                          )
                        }
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={item.schemaName}
                        className="flex-1 cursor-pointer text-sm font-medium"
                      >
                        {item.collectionName} ({item.count}
                        {item.count === 1 ? " record" : " records"})
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || selectedSchemas.length === 0}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>Delete</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
