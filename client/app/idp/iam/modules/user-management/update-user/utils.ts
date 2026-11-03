import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_IAM_MODULE = "data.idp.iam";

export const inviteUserFormDefaultValue = {
  firstName: "",
  lastName: "",
};

export const inviteUserFormSchema = z.lazy(() => z.object({
  firstName: z
    .string()
    .trim()
    .min(1, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_USER_UTILS.FIRST_NAME_IS_REQUIRED"))
    .max(150, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_USER_UTILS.FIRST_NAME_MUST_BE_AT_MOST")),
  lastName: z
    .string()
    .trim()
    .min(1, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_USER_UTILS.LAST_NAME_IS_REQUIRED"))
    .max(150, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_USER_UTILS.LAST_NAME_MUST_BE_AT_MOST")),
}));
