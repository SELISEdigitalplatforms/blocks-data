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
import { useCreateDmsFolder } from "@blocks-storage/hooks/use-storage-file";
import { ICreateDmsFolderPayload } from "@blocks-storage/models/storage.model";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/useProjectStore";

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
  const { mutateAsync: createDmsFolderMutate, isPending } = useCreateDmsFolder();
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
      const payload: ICreateDmsFolderPayload = {
        artifactName: data.name,
        description: "Folder creation",
        parentId,
        tags: [],
        metaData: {},
        organizationId: "",
        fileStorageId: "",
        projectKey,
        configurationName,
      };

      const res = await createDmsFolderMutate(payload);
      if (res.httpStatusCode == 200) {
        showSuccessToast({ description: "Folder created successfully." });
      }

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
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

                <Button type="submit" variant="default" disabled={!isValid || isPending}>
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
