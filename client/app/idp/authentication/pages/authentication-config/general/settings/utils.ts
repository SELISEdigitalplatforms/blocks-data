import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";
const SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER = "SETTINGS_UTILS.MUST_BE_A_WHOLE_NUMBER";
const SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER = "SETTINGS_UTILS.MUST_BE_A_POSITIVE_NUMBER";
const SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1 = "SETTINGS_UTILS.VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1";

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
    .int({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER) })
    .positive({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER) })
    .max(2147483647, {
      message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1),
    }),
  getNumberOfWrongAttemptsToLockTheAccount: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER) })
    .positive({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER) })
    .max(2147483647, {
      message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1),
    }),
  accountLockDurationInMinutes: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER) })
    .positive({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER) })
    .max(2147483647, {
      message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1),
    }),
  accessTokenValidForNumberMinutes: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER) })
    .positive({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER) })
    .max(2147483647, {
      message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1),
    }),
  rememberMeRefreshTokenValidForNumberMinutes: z.coerce
    .number()
    .int({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_WHOLE_NUMBER) })
    .positive({ message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_MUST_BE_A_POSITIVE_NUMBER) })
    .max(2147483647, {
      message: tStatic(DATA_IDP_AUTHENTICATION_MODULE, SETTINGS_UTILS_VALUE_EXCEEDS_THE_ALLOWED_LIMIT_1),
    }),
}));
