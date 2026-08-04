"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogFooter,
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
import { FolderPlus, LoaderCircle } from "lucide-react";

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isPending) {
      form.reset();
    }

    onOpenChange(nextOpen);
  };

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
      handleOpenChange(false);
      onSuccess?.();
    } catch (error) {
      form.reset();
      return showErrorToast({ errors: error });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          document.body.style.pointerEvents = "";
        }}
      >
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>Create Directory</DialogTitle>
              <DialogDescription>
                Keep related files together with a clear, descriptive name.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-5 px-6 py-5"
            onSubmit={form.handleSubmit(onSubmit)}
            aria-busy={isPending}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Directory name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter directory name"
                      disabled={isPending}
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isPending ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating directory…
              </div>
            ) : null}
            <DialogFooter className="-mx-6 -mb-5 mt-6 border-t bg-muted/20 px-6 py-4 sm:gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="default" disabled={!isValid || isPending}>
                {isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
