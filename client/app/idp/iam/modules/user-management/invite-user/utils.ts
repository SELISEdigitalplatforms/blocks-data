import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const inviteUserFormDefaultValue = {
  email: "",
  firstName: "",
  lastName: "",
};

export const inviteUserFormSchema = z.lazy(() => z.object({
  email: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "INVITE_USER_UTILS.EMAIL_IS_REQUIRED"))
    .email({ message: tStatic("data.idp.iam", "INVITE_USER_UTILS.PLEASE_ENTER_A_VALID_EMAIL_ADDRESS") }),
  firstName: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "INVITE_USER_UTILS.FIRST_NAME_IS_REQUIRED"))
    .max(150, tStatic("data.idp.iam", "INVITE_USER_UTILS.FIRST_NAME_MUST_BE_AT_MOST")),
  lastName: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "INVITE_USER_UTILS.LAST_NAME_IS_REQUIRED"))
    .max(150, tStatic("data.idp.iam", "INVITE_USER_UTILS.LAST_NAME_MUST_BE_AT_MOST")),
}));
