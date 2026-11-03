import { Logo } from "@/components/logo";
import { Check } from "lucide-react";
import { useT } from "@seliseblocks/genesis-os/i18n";

type SignupEmailSentProps = {
  email: string;
};

export const SignupEmailSent = ({ email }: SignupEmailSentProps) => {
  const { t } = useT("data.idp.authentication");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mb-4 p-4 sm:mt-[-252px]">
        <Logo src={"/Logo.svg"} width={128} height={54.931} />
      </div>
      <Check className="my-6 text-[#17C964]" size={40} />
      <div className="mx-auto flex w-11/12 flex-col items-center gap-1 text-center sm:max-w-2xl">
        <h3 className="my-6 text-3xl font-bold tracking-tight">{t("SIGNUP_EMAIL_SENT.EMAIL_SENT")}</h3>
        <p className="text-xl text-foreground">
          {t("SIGNUP_EMAIL_SENT.AN_EMAIL_HAS_BEEN_SENT_TO")}
          <span className="font-semibold text-primary underline">{email}</span>{t("SIGNUP_EMAIL_SENT.PLEASE_FOLLOW_THE_LINK_ON_THE")}
        </p>
      </div>
    </div>
  );
};
