"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui-kits/dialog/dialog";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { useForm } from "react-hook-form";
import { useCreateDmsFolder } from "@/storage/hooks/use-dms";
import { CreateFolderDto } from "@/storage/models/dms.model";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";

const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
});

type CreateFolderFormData = z.infer<typeof createFolderSchema>;

type CreateDmsFolderModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  parentId: string;
  configurationName: string;
  onSuccess?: () => void;
};

export const CreateDmsNewFolder = ({
  open,
  onOpenChange,
  parentId,
  configurationName,
  onSuccess,
}: CreateDmsFolderModalProps) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync: createDmsFolderMutate, isPending } =
    useCreateDmsFolder();
  const form = useForm<CreateFolderFormData>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: "",
    },
    mode: "onChange",
  });

  const { isValid } = form.formState;

  const onSubmit = async (data: CreateFolderFormData) => {
    try {
      // The folder service routes a payload with a parent to /Folders/CreateFolder and one
      // without to /Folders/CreateRootFolder, so the empty root id creates a root folder
      // rather than being sent as a nested one with a blank parent.
      const payload: CreateFolderDto = {
        name: data.name,
        parentDirectoryId: parentId || undefined,
        description: "Folder creation",
        configurationName,
        projectKey,
      };

      await createDmsFolderMutate(payload);
      showSuccessToast({ description: "Folder created successfully." });

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      form.reset();
      return showErrorToast({ errors: error });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.style.pointerEvents = "";
      }}
      >
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Folder Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter folder name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="mt-6 flex w-full items-center justify-end">
              <div className="flex flex-row gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>

                <Button
                  type="submit"
                  variant="default"
                  disabled={!isValid || isPending}
                >
                  Create
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
