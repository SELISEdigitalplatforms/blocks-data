import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import { Trash } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useState } from "react";
import { IStorageConfiguration } from "@/storage/models/storage.model";
import { useDeleteStorageConfiguration } from "@/storage/hooks/use-storage-configuration";
import { useProjectStore } from "@/store/useProjectStore";

type DeleteStorageConfigurationProps = {
  configuration: IStorageConfiguration;
};

export const DeleteStorageConfiguration = ({ configuration }: DeleteStorageConfigurationProps) => {
  const tenantId = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync, isPending } = useDeleteStorageConfiguration();
  const [isOpen, setIsOpen] = useState(false);
  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({
        projectKey: tenantId,
        configurationName: configuration.name,
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      setIsOpen(false);
      showSuccessToast({ description: "Configuration deleted" });
    } catch (error) {
      if (error && typeof error === "object" && "errors" in error) {
        showErrorToast({ errors: error.errors });
      }
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-error text-error hover:bg-error hover:text-white"
        >
          <Trash className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ml-2">Delete</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="mr-4 w-full rounded-md sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-left">Delete Configuration</DialogTitle>
          <DialogDescription className="text-left">
            Are you sure you want to delete this storage configuration? This action may result in
            the loss of existing data associated with this configuration.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row gap-2">
          <DialogTrigger asChild>
            <Button className="min-w-[80px]" variant="outline" size="default">
              Cancel
            </Button>
          </DialogTrigger>

          <Button
            className="min-w-[80px]"
            size="default"
            onClick={onClickHandler}
            disabled={isPending}
          >
            Yes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
