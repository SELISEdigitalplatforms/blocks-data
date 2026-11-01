import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_SECURITY_MODULE = "data.idp.security";

export const ConfigureCaptchaFormSchema = z.lazy(() => z.object({
  provider: z.enum(["recaptcha", "hcaptcha"]),
  captchaKey: z.string().min(1, tStatic(DATA_IDP_SECURITY_MODULE, "UTILS.SITE_KEY_IS_REQUIRED")),
  captchaSecret: z.string().min(1, tStatic(DATA_IDP_SECURITY_MODULE, "UTILS.SECRET_KEY_IS_REQUIRED")),
  captchaGenerator: z.string().min(1, tStatic(DATA_IDP_SECURITY_MODULE, "UTILS.GENERATOR_TYPE_IS_REQUIRED")),
}));
export const ConfigureCaptchaFormDefaultValue = {
  provider: "",
  captchaKey: "",
  captchaSecret: "",
  captchaGenerator: "",
};
