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
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useConfigureUserMFA } from "@blocks-idp/mfa/hooks/use-mfa-config";
import { useContext, useState } from "react";
import { userMfaContext } from "../user-mfa";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const UserMFAConfirmationDisable = () => {
  const { t } = useT("data.idp.iam");
  const { projectKey, userId } = useContext(userMfaContext);
  const [open, setOpen] = useState<boolean>(false);
  const { isPending, mutateAsync } = useConfigureUserMFA({ id: userId, projectKey });
  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({
        mfaEnabled: false,
        projectKey,
        userId,
        userMfaType: 0,
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({ description: t("USER_MFA_CONFIRMATION_DISABLE.MFA_DISABLED_SUCCESSFULLY") });
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive-outline">
          {t("USER_MFA_CONFIRMATION_DISABLE.DISABLE")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("USER_MFA_CONFIRMATION_DISABLE.DISABLE_MFA")}</DialogTitle>
          <DialogDescription>
            {t("USER_MFA_CONFIRMATION_DISABLE.ARE_YOU_SURE_YOU_WANT_TO")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-row gap-2">
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              {t("common:CANCEL")}
            </Button>
          </DialogTrigger>
          <Button size="sm" onClick={onClickHandler} disabled={isPending}>
            {isPending ? t("USER_MFA_CONFIRMATION_DISABLE.PROCESSING") : t("common:YES")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
