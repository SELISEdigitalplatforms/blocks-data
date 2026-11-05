import { useGetTotp } from "@blocks-idp/mfa/hooks/use-mfa-config";
import { useContext } from "react";
import { userMfaContext } from "../../user-mfa";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const UserMfaVerifyGuideLineTotp = () => {
  const { t } = useT("data.idp.iam");
  const { userId, projectKey } = useContext(userMfaContext);
  const { data } = useGetTotp({ id: userId, projectKey });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        <span>1.</span>
        <span>
          {t("USER_MFA_VERIFY_GUIDELINE_TOTP.SCAN_THE_QR_CODE_BELOW_OR")}
        </span>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative aspect-square w-40 rounded-sm border p-2">
          <img alt={t("USER_MFA_VERIFY_GUIDELINE_TOTP.QR_CODE")} src={data?.qrImageUrl || ""} />
        </div>
        <div className="text-center">
          <p className="text-medium-emphasis">{t("USER_MFA_VERIFY_GUIDELINE_TOTP.OR_ENTER_THIS_CODE_MANUALLY_IN")}</p>
          <p className="mt-2 font-semibold">{data?.qrCode}</p>
        </div>
      </div>
      <div className="flex gap-1">
        <span>2.</span>
        <span>{t("USER_MFA_VERIFY_GUIDELINE_TOTP.VERIFY_THE_PAIRING_WAS_SUCCESSFUL_BY")}</span>
      </div>
    </div>
  );
};
