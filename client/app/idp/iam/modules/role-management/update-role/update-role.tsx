import { useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui-kits/button/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { showErrorToast, showSuccessToast, useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { z } from "zod";
import { updateRoleFormSchema } from "./utils";
import { useProjectStore } from "@/store/use-project-store";
import { IRole } from "@blocks-idp/iam/models/role";
import { useUpdateRole } from "@blocks-idp/iam/hooks/use-roles";
import { isErrorWithErrors } from "@/lib/error";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UpdateRoleProps = { role: IRole; isOpen: boolean; onClose: () => void };

export const UpdateRole = ({ role, isOpen, onClose }: UpdateRoleProps) => {
  const { t } = useT("data.idp.iam");
  const { toast } = useToast();
  const { mutateAsync, isPending } = useUpdateRole();
  const tenantId = useProjectStore().selectedProject?.itemId || "";

  const form = useForm({
    defaultValues: role,
    resolver: zodResolver(updateRoleFormSchema),
  });

  const {
    formState: { isDirty },
  } = form;

  const onSubmit: SubmitHandler<z.infer<typeof updateRoleFormSchema>> = async (data) => {
    const newRole = {
      ...data,
      projectKey: tenantId,
      itemId: role.itemId,
    };
    try {
      await mutateAsync(newRole);
      toast({
        variant: "success",
        title: t("common:SUCCESS"),
        description: t("UPDATE_ROLE.ROLE_UPDATED_SUCCESSFULLY"),
      });
      showSuccessToast({ description: t("UPDATE_ROLE.ROLE_UPDATED_SUCCESSFULLY") });
      onClose();
    } catch (error) {
      if (isErrorWithErrors(error)) {
        const { errors } = error;
        showErrorToast({ errors });
      }
    }
  };

  useEffect(() => {
    if (!isOpen) form.reset(role);
  }, [role, form, isOpen]);

  return (
    <DialogContent>
      <DialogHeader className="mb-4">
        <DialogTitle>{t("UPDATE_ROLE.UPDATE_ROLE")}</DialogTitle>
        <DialogDescription></DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common:NAME")}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t("UPDATE_ROLE.ENTER_NAME")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="description"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common:DESCRIPTION")}</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder={t("UPDATE_ROLE.ENTER_DESCRIPTION")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter className="mt-6">
            <DialogTrigger asChild>
              <Button className="min-w-[80px]" variant="outline" disabled={isPending}>
                {t("common:CANCEL")}
              </Button>
            </DialogTrigger>
            <Button className="min-w-[80px]" type="submit" disabled={isPending || !isDirty}>
              {isPending ? t("UPDATE_ROLE.UPDATING") : t("common:UPDATE")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
};
