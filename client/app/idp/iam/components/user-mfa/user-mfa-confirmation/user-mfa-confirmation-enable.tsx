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
import { showErrorToast, showSuccessToast, toast } from "@/hooks/use-toast";
import { useConfigureUserMFA } from "@blocks-idp/mfa/hooks/use-mfa-config";
import { useContext, useState } from "react";
import { UserMFAMethodList } from "./user-mfa-methods-list";
import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { isErrorWithErrors } from "@/lib/error";
import { userMfaContext } from "../user-mfa";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const UserMFAConfirmationEnable = () => {
  const { t } = useT("data.idp.iam");
  const { projectKey, userId, enableTotpModal, showTotpModal } = useContext(userMfaContext);
  const [open, setOpen] = useState<boolean>(false);

  const [type, setType] = useState(0);
  const { isPending, mutateAsync } = useConfigureUserMFA({ id: userId, projectKey });
  const { data: userData, isLoading, isFetching } = useGetUserById({ id: userId, projectKey });

  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({
        mfaEnabled: true,
        projectKey,
        userId,
        userMfaType: type,
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({ description: t("USER_MFA_CONFIRMATION_ENABLE.MFA_ENABLED_SUCCESSFULLY") });
      setOpen(false);
      if (enableTotpModal) showTotpModal(type);
    } catch (error) {
      if (isErrorWithErrors(error)) showErrorToast({ errors: error.errors });
    }
  };

  const onTriggerHandler = () => {
    if (!userData?.data.isVarified) {
      return toast({
        variant: "info",
        title: t("USER_MFA_CONFIRMATION_ENABLE.INFO"),
        description: t("USER_MFA_CONFIRMATION_ENABLE.PLEASE_VERIFY_THE_USER_FIRST"),
      });
    }
    if (!userData?.data.active) {
      return toast({
        variant: "info",
        title: t("USER_MFA_CONFIRMATION_ENABLE.INFO"),
        description: t("USER_MFA_CONFIRMATION_ENABLE.PLEASE_ACTIVE_THE_USER_FIRST"),
      });
    }
    return setOpen(true);
  };

  const onOpenChangeHandler = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) setType(0);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChangeHandler}>
      <Button variant="outline" onClick={onTriggerHandler} size="sm">
        {t("USER_MFA_CONFIRMATION_ENABLE.ENABLE")}
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("USER_MFA_CONFIRMATION_ENABLE.ENABLE_MFA")}</DialogTitle>
          <DialogDescription>{t("USER_MFA_CONFIRMATION_ENABLE.SELECT_THE_METHOD_OF_MFA_FOR")}</DialogDescription>
        </DialogHeader>
        <UserMFAMethodList selected={type} setSelected={setType} projectKey={projectKey} />
        <DialogFooter className="mt-4 flex flex-row gap-2">
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isPending}>
              {t("common:CANCEL")}
            </Button>
          </DialogTrigger>
          <Button
            size="sm"
            onClick={onClickHandler}
            disabled={isPending || type === 0 || isLoading || isFetching}
          >
            {isPending ? t("USER_MFA_CONFIRMATION_ENABLE.SAVING") : t("common:SAVE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
