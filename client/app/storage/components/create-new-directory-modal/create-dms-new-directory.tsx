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
import { useCreateDmsDirectory } from "@/storage/hooks/use-dms";
import { CreateDirectoryDto } from "@/storage/models/dms.model";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { LoaderCircle } from "lucide-react";

const createDirectorySchema = z.object({
  name: z.string().min(1, "Directory name is required"),
});

type CreateDirectoryFormData = z.infer<typeof createDirectorySchema>;

type CreateDmsDirectoryModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  parentId: string;
  configurationName: string;
  onSuccess?: () => void;
};

export const CreateDmsNewDirectory = ({
  open,
  onOpenChange,
  parentId,
  configurationName,
  onSuccess,
}: CreateDmsDirectoryModalProps) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync: createDmsDirectoryMutate, isPending } = useCreateDmsDirectory();
  const form = useForm<CreateDirectoryFormData>({
    resolver: zodResolver(createDirectorySchema),
    defaultValues: {
      name: "",
    },
    mode: "onChange",
  });

  const { isValid } = form.formState;

  const onSubmit = async (data: CreateDirectoryFormData) => {
    try {
      // The directory service routes a payload with a parent to /Directories/CreateDirectory and one
      // without to /Directories/CreateRootDirectory, so the empty root id creates a root directory
      // rather than being sent as a nested one with a blank parent.
      const payload: CreateDirectoryDto = {
        name: data.name,
        parentDirectoryId: parentId || undefined,
        description: "Directory creation",
        configurationName,
        projectKey,
      };

      await createDmsDirectoryMutate(payload);
      showSuccessToast({ description: "Directory created successfully." });

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
          <DialogTitle>Create Directory</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
            aria-busy={isPending}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Directory Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter directory name" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isPending ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating directory…
              </div>
            ) : null}
            <div className="mt-6 flex w-full items-center justify-end">
              <div className="flex flex-row gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={isPending}>
                    Cancel
                  </Button>
                </DialogClose>

                <Button type="submit" variant="default" disabled={!isValid || isPending}>
                  {isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
