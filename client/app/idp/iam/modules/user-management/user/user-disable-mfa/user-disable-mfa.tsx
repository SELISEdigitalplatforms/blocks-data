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
import { useDisableMfa } from "@blocks-idp/mfa/hooks/use-mfa-config";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserDisableMFAProps = {
  projectKey: string;
  userId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const UserDisableMFA = ({ userId, projectKey, open, setOpen }: UserDisableMFAProps) => {
  const { t } = useT("data.idp.iam");
  const { isPending, mutateAsync } = useDisableMfa({ id: userId, projectKey });
  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({
        projectKey,
        userId,
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({ description: t("USER_DISABLE_MFA.MFA_DISABLED_SUCCESSFULLY") });
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("USER_DISABLE_MFA.DISABLE_MFA")}</DialogTitle>
          <DialogDescription>
            {t("USER_DISABLE_MFA.ARE_YOU_SURE_YOU_WANT_TO")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-row gap-2">
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              {t("common:CANCEL")}
            </Button>
          </DialogTrigger>
          <Button size="sm" onClick={onClickHandler} disabled={isPending}>
            {isPending ? t("USER_DISABLE_MFA.PROCESSING") : t("common:YES")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
