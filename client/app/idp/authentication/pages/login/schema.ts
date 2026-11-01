import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const signinFormDefaultValue = {
  username: "",
  password: "",
};

export const signinFormSchema = z.lazy(() => z.object({
  username: z.string().min(1, tStatic("data.idp.authentication", "SCHEMA.EMAIL_IS_REQUIRED")).email(tStatic("data.idp.authentication", "SCHEMA.INVALID_EMAIL_FORMAT")),
  password: z.string().min(1, tStatic("data.idp.authentication", "SCHEMA.PASSWORD_IS_REQUIRED")),
}));
