import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/use-project-store";
import { useAccountDeactivate } from "@blocks-idp/iam/hooks/use-account";
import { isErrorWithErrors } from "@/lib/error";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserDeactivateProps = {
  userId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const UserDeactivate = ({
  userId,
  open,
  setOpen,
}: UserDeactivateProps) => {
  const { t } = useT("data.idp.iam");
  const tenantId = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync, isPending } = useAccountDeactivate();
  const onClickHandler = async () => {
    try {
      const res = await mutateAsync({ projectKey: tenantId, userId });
      if (res.isSuccess) {
        showSuccessToast(
          { description: t("USER_DEACTIVATE.USER_HAS_BEEN_DEACTIVATED_SUCCESSFULLY") }
        );
      }
      else { showErrorToast({ errors: res.errors }); }
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      }
      else {
        showErrorToast({ errors: t("USER_DEACTIVATE.SOMETHING_WENT_WRONG") });
      }
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
          dialogTitle: t("USER_DEACTIVATE.CONFIRMATION"),
          dialogSubtitle: t("USER_DEACTIVATE.ARE_YOU_SURE_YOU_WANT_TO"),
          confirmButton: t("USER_DEACTIVATE.DEACTIVATE"),
        }}
        buttonState={{
          confirm: { disable: isPending },
        }}
      />
    </Dialog>
  );
};
