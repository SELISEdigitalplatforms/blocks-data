import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const createOidcSchema = z.lazy(() => z.object({
redirectUrlOidc: z.string().url(tStatic(DATA_IDP_AUTHENTICATION_MODULE, "CREATE_OIDC_UTILS.MUST_BE_A_VALID_URL")).refine((val) => {
  try {
    const url = new URL(val);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "CREATE_OIDC_UTILS.ONLY_HTTP_IS_ALLOWED_FOR_LOCALHOST")),  
audienceUrlOidc: z.string().url(tStatic(DATA_IDP_AUTHENTICATION_MODULE, "CREATE_OIDC_UTILS.MUST_BE_A_VALID_URL")).refine((val) => {
  try {
    const url = new URL(val);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "CREATE_OIDC_UTILS.ONLY_HTTP_IS_ALLOWED_FOR_LOCALHOST")), 
  scope: z.string().trim(),
  clientBrandColor: z.string().optional(),
  clientDisplayName: z.string().trim().min(1, tStatic(DATA_IDP_AUTHENTICATION_MODULE, "CREATE_OIDC_UTILS.CLIENT_DISPLAY_NAME_IS_REQUIRED")),
}));

export type CreateOIDCFormValues = z.infer<typeof createOidcSchema>;

export const createOIDCFormDefaultValue: CreateOIDCFormValues = {
  audienceUrlOidc: "",
  redirectUrlOidc: "",
  scope: "openid",
  clientBrandColor: "#FFFFFF",
  clientDisplayName: "",
};
