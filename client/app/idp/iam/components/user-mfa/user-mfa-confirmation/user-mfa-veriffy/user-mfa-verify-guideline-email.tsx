import { useContext } from "react";
import { userMfaContext } from "../../user-mfa";
import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { useT } from "@seliseblocks/genesis-os/i18n";

const imageUrl = "/assets/images/mail-sent.png";

export const UserMfaVerifyGuideLineEmail = () => {
  const { t } = useT("data.idp.iam");
  const { userId, projectKey } = useContext(userMfaContext);
  const { data } = useGetUserById({ id: userId, projectKey });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center">
        <img src={imageUrl} alt={t("USER_MFA_VERIFY_GUIDELINE_EMAIL.EMAIL_SENT")} width="120" height="100" />
      </div>
      <div className="mt-6">
        <h3 className="text-2xl font-bold">{t("USER_MFA_VERIFY_GUIDELINE_EMAIL.EMAIL_SENT_2")}</h3>
        <p className="mt-2">
          {t("USER_MFA_VERIFY_GUIDELINE_EMAIL.WE_VE_SENT_A_VERIFICATION_KEY", { email: data?.data.email ?? "" })}
        </p>
      </div>
      <p>{t("USER_MFA_VERIFY_GUIDELINE_EMAIL.DID_NOT_RECEIVE_MAIL")} </p>
      <p>{t("USER_MFA_VERIFY_GUIDELINE_EMAIL.PLEASE_ENTER_THE_KEY_BELOW_TO")} </p>
    </div>
  );
};
