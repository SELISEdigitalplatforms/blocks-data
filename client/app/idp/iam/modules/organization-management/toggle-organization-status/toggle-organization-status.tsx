
import { Button } from "@/components/ui-kits/button/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/use-project-store";
import { IOrganization } from "@blocks-idp/iam/models/organization";
import { useSaveOrganization } from "@blocks-idp/iam/hooks/use-organization";
import { useT } from "@seliseblocks/genesis-os/i18n";

type ToggleOrganizationStatusProps = {
  organization: IOrganization;
  onClose: () => void;
};

export const ToggleOrganizationStatus = ({
  organization,
  onClose,
}: ToggleOrganizationStatusProps) => {
  const { t } = useT("data.idp.iam");
  const { mutateAsync, isPending } = useSaveOrganization();
  const tenantId = useProjectStore().selectedProject?.tenantId || "";

  const isEnabling = !organization.isEnable;
  const actionLabel = isEnabling
    ? t("TOGGLE_ORGANIZATION_STATUS.ENABLE")
    : t("TOGGLE_ORGANIZATION_STATUS.DISABLE");
  const actioningLabel = isEnabling ? t("TOGGLE_ORGANIZATION_STATUS.ENABLING") : t("TOGGLE_ORGANIZATION_STATUS.DISABLING");

  const handleConfirm = async () => {
    try {
      const res = await mutateAsync({
        projectKey: tenantId,
        name: organization.name,
        itemId: organization.itemId,
        isEnable: isEnabling,
      });
      if (!res.isSuccess) {
        showErrorToast({ errors: res.errors });
        return;
      }
      showSuccessToast({
        description: t(isEnabling ? "TOGGLE_ORGANIZATION_STATUS.ORGANIZATION_ENABLED_SUCCESSFULLY" : "TOGGLE_ORGANIZATION_STATUS.ORGANIZATION_DISABLED_SUCCESSFULLY"),
      });
      onClose();
    } catch (error: unknown) {
      if (error && typeof error === "object" && "errors" in error) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  return (
    <DialogContent>
      <DialogHeader className="mb-4">
        <DialogTitle>
          {t(isEnabling ? "TOGGLE_ORGANIZATION_STATUS.ENABLE_ORGANIZATION" : "TOGGLE_ORGANIZATION_STATUS.DISABLE_ORGANIZATION")}
        </DialogTitle>
        <DialogDescription>
          {t(isEnabling ? "TOGGLE_ORGANIZATION_STATUS.ARE_YOU_SURE_YOU_WANT_TO_ENABLE" : "TOGGLE_ORGANIZATION_STATUS.ARE_YOU_SURE_YOU_WANT_TO_DISABLE", {
            name: organization.name,
          })}
          {!isEnabling && ` ${t("TOGGLE_ORGANIZATION_STATUS.THIS_WILL_MAKE_IT_INACTIVE")}`}
          {isEnabling && ` ${t("TOGGLE_ORGANIZATION_STATUS.THIS_WILL_MAKE_IT_ACTIVE_AGAIN")}`}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-6">
        <DialogTrigger asChild>
          <Button className="min-w-[80px]" variant="outline" disabled={isPending}>
            {t("common:CANCEL")}
          </Button>
        </DialogTrigger>
        <Button
          className="min-w-[80px]"
          variant={isEnabling ? "default" : "destructive"}
          onClick={handleConfirm}
          disabled={isPending}
        >
          {isPending ? actioningLabel : actionLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};
