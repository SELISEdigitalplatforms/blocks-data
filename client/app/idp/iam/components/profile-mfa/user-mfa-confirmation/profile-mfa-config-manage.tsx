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
import { showErrorToast } from "@/hooks/use-toast";
import { useConfigureUserMFA } from "@blocks-idp/mfa/hooks/use-mfa-config";
import { useContext, useState } from "react";
import { ProfileMFAMethodList } from "./profile-mfa-methods-list";
import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { isErrorWithErrors } from "@/lib/error";
import { profileMfaContext } from "../profile-mfa";
import { RefreshCcw } from "lucide-react";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const ProfileMFAConfigManage = () => {
  const { t } = useT("data.idp.iam");
  const { projectKey, userId, showVerifyModal } = useContext(profileMfaContext);
  const [open, setOpen] = useState<boolean>(false);
  const [type, setType] = useState(0);
  const { isPending, mutateAsync } = useConfigureUserMFA({ id: userId, projectKey });
  const { data: userData, isLoading, isFetching } = useGetUserById({ id: userId, projectKey });
  const [prevMfaType, setPrevMfaType] = useState<number | undefined | null>(null);
  if (userData?.data.userMfaType !== prevMfaType) {
    setPrevMfaType(userData?.data.userMfaType);
    if (userData?.data.userMfaType) {
      setType(userData?.data.userMfaType);
    }
  }

  const onClickHandler = async () => {
    if (userData?.data?.userMfaType === type) {
      if (!userData?.data.isMfaVerified) {
        setOpen(false);
        showVerifyModal(type);
      }
      return setOpen(false);
    }
    try {
      const res = await mutateAsync({
        mfaEnabled: true,
        projectKey,
        userId,
        userMfaType: type,
      });
      if (!res.isSuccess) return showErrorToast({ errors: res.errors });
      setOpen(false);
      showVerifyModal(type);
    } catch (error) {
      if (isErrorWithErrors(error)) showErrorToast({ errors: error.errors });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCcw className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-2">{t("PROFILE_MFA_CONFIG_MANAGE.SWITCH")}</span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("PROFILE_MFA_CONFIG_MANAGE.SWITCH_MFA")}</DialogTitle>
          <DialogDescription>{t("PROFILE_MFA_CONFIG_MANAGE.SELECT_THE_METHOD_OF_MFA_FOR")}</DialogDescription>
        </DialogHeader>
        <ProfileMFAMethodList selected={type} setSelected={setType} />
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
            {isPending ? t("PROFILE_MFA_CONFIG_MANAGE.SAVING") : t("common:SAVE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
