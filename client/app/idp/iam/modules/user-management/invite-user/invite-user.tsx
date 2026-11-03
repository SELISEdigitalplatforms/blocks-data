import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import { Input } from "@/components/ui-kits/input/input";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { inviteUserFormDefaultValue, inviteUserFormSchema } from "./utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { useAddUser } from "@blocks-idp/iam/hooks/use-user";
import { z } from "zod";
import { useProjectStore } from "@/store/use-project-store";
import { useState } from "react";
import { isErrorWithErrors } from "@/lib/error";
import { PrimaryButton } from "@/components/action-buttons/primary-button";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const InviteUser = () => {
  const { t } = useT("data.idp.iam");
  const { isPending, mutateAsync } = useAddUser();
  const tenantId = useProjectStore().selectedProject?.tenantId || "";
  const [open, setOpen] = useState(false);

  const form = useForm({
    defaultValues: inviteUserFormDefaultValue,
    resolver: zodResolver(inviteUserFormSchema),
  });

  const handleDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    setOpen(isOpen);
  };

  const {
    formState: { isDirty },
  } = form;

  const onSubmitHandler = async (values: z.infer<typeof inviteUserFormSchema>) => {
    try {
      const res = await mutateAsync({
        ...values,
        userPassType: 1,
        userCreationType: 1,
        platform: "blocks_portal",
        projectKey: tenantId,
      });
      if (res.isSuccess) {
        showSuccessToast({ description: t("INVITE_USER.INVITATION_IS_SENT") });
        form.reset();
        setOpen(false);
      } else {
        showErrorToast({ errors: res.errors });
      }
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <PrimaryButton label={t("INVITE_USER.INVITE_USER")} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle>{t("INVITE_USER.INVITE_USER")}</DialogTitle>
          <DialogDescription className="mt-2! text-sm text-medium-emphasis">
            {t("INVITE_USER.INVITE_A_NEW_USER_TO_THE")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHandler)}>
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("INVITE_USER.FIRST_NAME")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("INVITE_USER.ENTER_FIRST_NAME")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("INVITE_USER.LAST_NAME")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("INVITE_USER.ENTER_LAST_NAME")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common:EMAIL")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("INVITE_USER.ENTER_EMAIL")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button variant="secondary" disabled={isPending}>
                  {t("common:CANCEL")}
                </Button>
              </DialogClose>
              <Button disabled={isPending || !isDirty}>{isPending ? t("INVITE_USER.SENDING") : t("INVITE_USER.SEND")}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
