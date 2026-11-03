import { Button } from "@/components/ui-kits/button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { EllipsisVertical, RotateCcw, Send, ShieldBan, UserX } from "lucide-react";
import { useState } from "react";
import { UserResetPassword } from "./user-reset-password";
import { UserResendActivationMail } from "./user-resend-activation/user-resend-activation";
import { UserDeactivate } from "./user-deactivate/user-deactivate";
import { UpdateUser } from "../update-user";
import { UserDisableMFA } from "./user-disable-mfa";
import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { useT } from "@seliseblocks/genesis-os/i18n";

type UserActionMenuProps = {
  id: string;
  projectKey: string;
};

export const UserActionMenu = ({ id, projectKey }: UserActionMenuProps) => {
  const { t } = useT("data.idp.iam");
  const { data } = useGetUserById({ id, projectKey });
  const [isResendActivationModalOpen, setIsResendActivationModalOpen] = useState<boolean>(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState<boolean>(false);
  const [isDisableMFAModalOpen, setIsDisableMFAModalOpen] = useState<boolean>(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState<boolean>(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="px-2">
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setIsResendActivationModalOpen(true);
              }}
            >
              <Send className="aspect-square w-4" />
              <span>{t("USER_ACTION_MENU.RESEND_ACTIVATION")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => setIsResetPasswordModalOpen(true)}>
              <RotateCcw className="aspect-square w-4" />
              <span>{t("USER_ACTION_MENU.RESET_PASSWORD")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => setIsDisableMFAModalOpen(true)}
              disabled={!data?.data.mfaEnabled}
            >
              <ShieldBan className="aspect-square w-4" />
              <span>{t("USER_ACTION_MENU.DISABLE_MFA")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => setIsDeactivateModalOpen(true)}
              disabled={!data?.data?.active}
            >
              <UserX className="aspect-square w-4" />
              <span>{t("USER_ACTION_MENU.DEACTIVATE_USER")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <UpdateUser id={id} projectKey={projectKey} />
      </div>
      <UserResendActivationMail
        open={isResendActivationModalOpen}
        setOpen={setIsResendActivationModalOpen}
        userId={id}
      />
      <UserResetPassword
        projectKey={projectKey}
        userId={id}
        open={isResetPasswordModalOpen}
        setOpen={setIsResetPasswordModalOpen}
      />
      <UserDisableMFA
        userId={id}
        projectKey={projectKey}
        open={isDisableMFAModalOpen}
        setOpen={setIsDisableMFAModalOpen}
      />
      <UserDeactivate
        userId={id}
        open={isDeactivateModalOpen}
        setOpen={setIsDeactivateModalOpen}
      />
    </>
  );
};
