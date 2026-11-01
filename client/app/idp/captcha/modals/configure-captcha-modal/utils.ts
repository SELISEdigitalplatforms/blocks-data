import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const ConfigureCaptchaFormSchema = z.lazy(() => z.object({
  provider: z.enum(["recaptcha", "hcaptcha"]),
  captchaKey: z.string().min(1, tStatic("data.idp.security", "UTILS.SITE_KEY_IS_REQUIRED")),
  captchaSecret: z.string().min(1, tStatic("data.idp.security", "UTILS.SECRET_KEY_IS_REQUIRED")),
  captchaGenerator: z.string().min(1, tStatic("data.idp.security", "UTILS.GENERATOR_TYPE_IS_REQUIRED")),
}));
export const ConfigureCaptchaFormDefaultValue = {
  provider: "",
  captchaKey: "",
  captchaSecret: "",
  captchaGenerator: "",
};
