import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const activationFormDefaultValue = {
  firstname: "",
  lastname: "",
  password: "",
  confirmPassword: "",
};

const hasWhitespace = /\s/;
const noWhitespaceMessage = "Password must not contain spaces";

const passwordSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (value && hasWhitespace.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: noWhitespaceMessage });
    }
  })
  .transform((value) => value.trim());

export const activationFormSchema = z.lazy(() => z.object({
  firstname: z.string().min(1, tStatic("data.idp.authentication", "ACTIVATION_UTILS.FIRST_NAME_IS_REQUIRED")),
  lastname: z.string().min(1, tStatic("data.idp.authentication", "ACTIVATION_UTILS.LAST_NAME_IS_REQUIRED")),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}));

