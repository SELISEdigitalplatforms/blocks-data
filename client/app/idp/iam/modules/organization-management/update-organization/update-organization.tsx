

import { Button } from "@/components/ui-kits/button/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/use-project-store";
import { useSaveOrganization } from "@blocks-idp/iam/hooks/use-organization";
import { IOrganization } from "@blocks-idp/iam/models/organization";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { updateOrganizationFormSchema } from "./utils";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UpdateOrganizationProps = {
  organization: IOrganization;
  isOpen: boolean;
};

export const UpdateOrganization = ({ organization, isOpen }: UpdateOrganizationProps) => {
  const { t } = useT("data.idp.iam");
  const { mutateAsync, isPending } = useSaveOrganization();
  const tenantId = useProjectStore().selectedProject?.tenantId || "";

  const form = useForm({
    defaultValues: { name: organization.name },
    resolver: zodResolver(updateOrganizationFormSchema),
  });

  const {
    formState: { isDirty },
  } = form;

  const onSubmit: SubmitHandler<z.infer<typeof updateOrganizationFormSchema>> = async (data) => {
    try {
      const res = await mutateAsync({
        projectKey: tenantId,
        name: data.name,
        itemId: organization.itemId,
        isEnable: organization.isEnable,
      });
      if (!res.isSuccess) {
        showErrorToast({ errors: res.errors });
        return;
      }
      showSuccessToast({ description: t("UPDATE_ORGANIZATION.ORGANIZATION_RENAMED_SUCCESSFULLY") });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "errors" in error) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      form.reset({ name: organization.name });
    }
  }, [isOpen, organization.name, form]);

  return (
    <DialogContent>
      <DialogHeader className="mb-4">
        <DialogTitle>{t("UPDATE_ORGANIZATION.RENAME_ORGANIZATION")}</DialogTitle>
        <DialogDescription>{t("UPDATE_ORGANIZATION.UPDATE_THE_ORGANIZATION_NAME")}</DialogDescription>
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
                  <Input {...field} placeholder={t("UPDATE_ORGANIZATION.ENTER_ORGANIZATION_NAME")} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button className="min-w-[80px]" variant="outline" disabled={isPending}>
                {t("common:CANCEL")}
              </Button>
            </DialogClose>
            <Button className="min-w-[80px]" type="submit" disabled={isPending || !isDirty}>
              {isPending ? t("UPDATE_ORGANIZATION.SAVING") : t("common:SAVE")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
};
