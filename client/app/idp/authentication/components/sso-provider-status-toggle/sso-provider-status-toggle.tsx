import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useProjectStore } from "@/store/use-project-store";
import { useUpdateSsoCredentialStatus } from "@blocks-idp/authentication/hooks/use-sso";
import { ISsoProviderConfigurationWithMeta } from "@blocks-idp/authentication/models/sso.model";
import { useT } from "@seliseblocks/genesis-os/i18n";

type SSoProviderStatusToggleProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
  configuration: ISsoProviderConfigurationWithMeta;
};

export const SSoProviderStatusToggle = ({
  open,
  setOpen,
  configuration,
}: SSoProviderStatusToggleProps) => {
  const { t } = useT("data.idp.authentication");
  const tenantId = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync } = useUpdateSsoCredentialStatus();

  const udpateStatus = async () => {
    try {
      if (!configuration.itemId || !tenantId)
        return showErrorToast({ errors: t("SSO_PROVIDER_STATUS_TOGGLE.SOMETHING_WENT_WRONG") });

      const res = await mutateAsync({
        itemId: configuration.itemId,
        projectKey: tenantId,
        isEnabled: !configuration.isDisabled,
      });

      if (!res.isSuccess) return showErrorToast({ errors: res.errors });

      showSuccessToast({
        description: t(
          configuration.isDisabled
            ? "SSO_PROVIDER_STATUS_TOGGLE.SSO_PROVIDER_ENABLED_SUCCESSFULLY"
            : "SSO_PROVIDER_STATUS_TOGGLE.SSO_PROVIDER_DISABLED_SUCCESSFULLY",
        ),
      });
      setOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) return showErrorToast({ errors: error.errors });

      showErrorToast({ errors: t("SSO_PROVIDER_STATUS_TOGGLE.SOMETHING_WENT_WRONG") });
    }
  };

  const isCurrentlyDisabled = configuration.isDisabled;
  const dialogTitle = isCurrentlyDisabled ? t("SSO_PROVIDER_STATUS_TOGGLE.ENABLE") : t("SSO_PROVIDER_STATUS_TOGGLE.DISABLE");
  const dialogSubtitle = isCurrentlyDisabled
    ? t("SSO_PROVIDER_STATUS_TOGGLE.ARE_YOU_SURE_YOU_WANT_TO")
    : t("SSO_PROVIDER_STATUS_TOGGLE.ARE_YOU_SURE_YOU_WANT_TO_2");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ConfirmationModal
        data={{
          dialogTitle,
          dialogSubtitle,
        }}
        onCancel={() => setOpen(false)}
        onConfirm={() => udpateStatus()}
      />
    </Dialog>
  );
};
