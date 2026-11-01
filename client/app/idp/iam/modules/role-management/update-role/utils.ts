import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_IAM_MODULE = "data.idp.iam";

export const updateRoleFormDefaultValue = {
  name: "",
  description: "",
};

export const updateRoleFormSchema = z.lazy(() => z.object({
  name: z
    .string()
    .trim()
    .min(1, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_ROLE_UTILS.NAME_FIELD_MUST_NOT_BE_EMPTY"))
    .max(50, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_ROLE_UTILS.NAME_MUST_BE_AT_MOST_50")),
  description: z.string().trim().max(150, tStatic(DATA_IDP_IAM_MODULE, "UPDATE_ROLE_UTILS.DESCRIPTION_MUST_BE_AT_MOST_150")).optional(),
}));
