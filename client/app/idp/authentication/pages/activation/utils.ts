import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const activationFormDefaultValue = {
  firstname: "",
  lastname: "",
  password: "",
  confirmPassword: "",
};

const hasWhitespace = /\s/;
const noWhitespaceMessage = () =>
  tStatic(DATA_IDP_AUTHENTICATION_MODULE, "ACTIVATION_UTILS.PASSWORD_MUST_NOT_CONTAIN_SPACES");

const passwordSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (value && hasWhitespace.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: noWhitespaceMessage() });
    }
  })
  .transform((value) => value.trim());

export const activationFormSchema = z.lazy(() => z.object({
  firstname: z.string().min(1, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "ACTIVATION_UTILS.FIRST_NAME_IS_REQUIRED")),
  lastname: z.string().min(1, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "ACTIVATION_UTILS.LAST_NAME_IS_REQUIRED")),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}));

