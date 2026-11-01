import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useAccountRecover } from "@blocks-idp/iam/hooks/use-account";
import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserResetPasswordProps = {
  userId: string;
  projectKey: string;
  open: boolean;
  setOpen: (value: boolean) => void;
};

export const UserResetPassword = ({
  userId,
  projectKey,
  open,
  setOpen,
}: UserResetPasswordProps) => {
  const { t } = useT("data.idp.iam");
  const { data } = useGetUserById({ projectKey, id: userId });
  const { mutateAsync, isPending } = useAccountRecover();

  const onClickHandler = async () => {
    try {
      const email = data?.data.email;
      if (!email) {
        throw Error(t("USER_RESET_PASSWORD.EMAIL_IS_NOT_PROVIDED_YET"));
      }
      const res = await mutateAsync({
        projectKey,
        email: data?.data.email,
        captchaCode: "",
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      showSuccessToast({
        description: t("USER_RESET_PASSWORD.PASSWORD_RESET_EMAIL_HAS_BEEN_SENT"),
      });
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) return showErrorToast({ errors: error.errors });
      showErrorToast({ errors: t("USER_RESET_PASSWORD.SOMETHING_WENT_WRONG") });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ConfirmationModal
        onCancel={() => setOpen(false)}
        onConfirm={onClickHandler}
        data={{
          dialogTitle: t("USER_RESET_PASSWORD.RESET_PASSWORD"),
          dialogSubtitle: t("USER_RESET_PASSWORD.ARE_YOU_SURE_YOU_WANT_TO"),
          confirmButton: t("common:RESET"),
        }}
        buttonState={{
          confirm: { disable: isPending },
        }}
      />
    </Dialog>
  );
};
