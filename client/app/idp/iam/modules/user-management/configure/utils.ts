import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_IAM_MODULE = "data.idp.iam";

export const iamConfigFormDefaultValues = {
  accountActivationUrl: "",
  accountVerificationUrl: "",
  recoverAccountUrl: "",
  activationUrlLifetimeInMinutes: 1,
  recoverAccountUrlLifetimeInMinutes: 1,
  logoutOnPasswordChange: true,
};

export const iamConfigFormSchema = z.lazy(() => z.object({
  accountActivationUrl: z.string().url({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.ACCOUNT_ACTIVATION_URL_MUST_BE_A") }),
  accountVerificationUrl: z
    .string()
    .url({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.ACCOUNT_VERIFICATION_URL_MUST_BE_A") }),
  recoverAccountUrl: z.string().url({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.RECOVERY_ACCOUNT_URL_MUST_BE_A") }),
  activationUrlLifetimeInMinutes: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
  recoverAccountUrlLifetimeInMinutes: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic(DATA_IDP_IAM_MODULE, "CONFIGURE_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),

  logoutOnPasswordChange: z.boolean(),
}));
