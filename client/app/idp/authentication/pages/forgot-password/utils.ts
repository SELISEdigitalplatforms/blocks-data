import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const forgotPasswordFormDefaultValue = {
  email: "",
};

export const forgotPasswordFormSchema = z.lazy(() => z.object({
  email: z.string().trim().email({ message: tStatic("data.idp.authentication", "FORGOT_PASSWORD_UTILS.INVALID_EMAIL") }),
}));
