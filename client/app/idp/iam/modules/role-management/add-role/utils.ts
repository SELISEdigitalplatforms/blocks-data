import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_IAM_MODULE = "data.idp.iam";

export const addRoleFormDefaultValue = {
  name: "",
  slug: "",
  description: "",
};

export const addRoleFormSchema = z.lazy(() => z.object({
  name: z.string().min(1, tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.NAME_IS_REQUIRED")).max(50, tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.NAME_MUST_BE_AT_MOST_50")).trim(),
  slug: z
    .string()
    .min(1, tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.SLUG_IS_REQUIRED"))
    .max(50, tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.SLUG_MUST_BE_AT_MOST_50"))
    .trim()
    .refine((s) => !s.includes(" "), tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.SLUG_CAN_NOT_CONTAIN_SPACES")),
  description: z.string().max(150, tStatic(DATA_IDP_IAM_MODULE, "ADD_ROLE_UTILS.DESCRIPTION_MUST_BE_AT_MOST_150")).trim().optional(),
}));
