import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const activationFormDefaultValue = {
  password: "",
  confirmPassword: "",
};

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&;[\]{}|:(),.])[A-Za-z\d@$!%*?&;[\]{}|:(),.]{8,30}$/;

export const activationFormSchema = z.lazy(() => z
  .object({
    password: z.string().min(8, tStatic("data.idp.authentication", "RESET_PASSWORD_UTILS.PASSWORD_MUST_BE_AT_LEAST_8")).regex(passwordRegex),
    confirmPassword: z.string().min(8, tStatic("data.idp.authentication", "RESET_PASSWORD_UTILS.CONFIRM_PASSWORD_MUST_BE_AT_LEAST")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: tStatic("data.idp.authentication", "RESET_PASSWORD_UTILS.PASSWORDS_MUST_BE_MATCHED"),
    path: ["confirmPassword"],
  }));
