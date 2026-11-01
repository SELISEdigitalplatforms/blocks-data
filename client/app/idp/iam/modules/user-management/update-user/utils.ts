import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const inviteUserFormDefaultValue = {
  firstName: "",
  lastName: "",
};

export const inviteUserFormSchema = z.lazy(() => z.object({
  firstName: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "UPDATE_USER_UTILS.FIRST_NAME_IS_REQUIRED"))
    .max(150, tStatic("data.idp.iam", "UPDATE_USER_UTILS.FIRST_NAME_MUST_BE_AT_MOST")),
  lastName: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "UPDATE_USER_UTILS.LAST_NAME_IS_REQUIRED"))
    .max(150, tStatic("data.idp.iam", "UPDATE_USER_UTILS.LAST_NAME_MUST_BE_AT_MOST")),
}));
