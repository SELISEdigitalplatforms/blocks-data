import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/use-project-store";
import { useAccountResendActivation } from "@blocks-idp/iam/hooks/use-account";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserResendActivationMailProps = {
  userId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const UserResendActivationMail = ({
  userId,
  open,
  setOpen,
}: UserResendActivationMailProps) => {
  const { t } = useT("data.idp.iam");
  const tenantId = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync, isPending } = useAccountResendActivation();
  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({ projectKey: tenantId, userId });
      if (res.isSuccess) {
        toast({
          variant: "success",
          title: t("common:SUCCESS"),
          description: t("USER_RESEND_ACTIVATION.ACTIVATION_EMAIL_HAS_BEEN_RESENT"),
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("common:ERROR"),
        description: t("USER_RESEND_ACTIVATION.SOMETHING_WENT_WRONG_DETAIL", { detail: JSON.stringify(error) }),
      });
    } finally {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ConfirmationModal
        onCancel={() => setOpen(false)}
        onConfirm={onClickHandler}
        data={{
          dialogTitle: t("USER_RESEND_ACTIVATION.CONFIRMATION"),
          dialogSubtitle: t("USER_RESEND_ACTIVATION.DO_YOU_WANT_TO_RESEND_THE"),
          confirmButton: t("USER_RESEND_ACTIVATION.RESEND"),
        }}
        buttonState={{
          confirm: { disable: isPending },
        }}
      />
    </Dialog>
  );
};
