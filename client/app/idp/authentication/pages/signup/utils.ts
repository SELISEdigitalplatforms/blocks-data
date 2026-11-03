import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const signupFormDefaultValue = {
  email: "",
};

export const signupFormSchema = z.lazy(() => z.object({
  email: z.string().trim().email({ message: tStatic("data.idp.authentication", "SIGNUP_UTILS.INVALID_EMAIL") }),
}));
