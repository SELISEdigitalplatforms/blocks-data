import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const authConfigFormDefaultValues = {
  refreshTokenValidForNumberMinutes: 0,
  getNumberOfWrongAttemptsToLockTheAccount: 0,
  accountLockDurationInMinutes: 0,
  accessTokenValidForNumberMinutes: 0,
  rememberMeRefreshTokenValidForNumberMinutes: 0,
};

export const authConfigFormSchema = z.lazy(() => z.object({
  refreshTokenValidForNumberMinutes: z.coerce
    .number()
    .int({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic("data.idp.authentication", "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
  getNumberOfWrongAttemptsToLockTheAccount: z.coerce
    .number()
    .int({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic("data.idp.authentication", "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
  accountLockDurationInMinutes: z.coerce
    .number()
    .int({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic("data.idp.authentication", "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
  accessTokenValidForNumberMinutes: z.coerce
    .number()
    .int({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic("data.idp.authentication", "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
  rememberMeRefreshTokenValidForNumberMinutes: z.coerce
    .number()
    .int({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER") })
    .positive({ message: tStatic("data.idp.authentication", "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER") })
    .max(2147483647, {
      message: tStatic("data.idp.authentication", "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1"),
    }),
}));
