import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const signinFormDefaultValue = {
  username: "",
  password: "",
};

export const signinFormSchema = z.lazy(() => z.object({
  username: z.string().min(1, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SCHEMA.EMAIL_IS_REQUIRED")).email(tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SCHEMA.INVALID_EMAIL_FORMAT")),
  password: z.string().min(1, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SCHEMA.PASSWORD_IS_REQUIRED")),
}));
