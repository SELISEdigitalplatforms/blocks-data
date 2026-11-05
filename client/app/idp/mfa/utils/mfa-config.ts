import { Mail, Smartphone } from "lucide-react";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_SECURITY_MODULE = "data.idp.security";

export const MFA_PROVIDER_DATA = [
  {
    provider: "email",
    get label() { return tStatic(DATA_IDP_SECURITY_MODULE, "common:EMAIL"); },
    Icon: Mail,
    status: false,
    type: 2,
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "MFA_CONFIG.RECEIVE_A_VERIFICATION_CODE_IN_YOUR"); },
  },
  {
    provider: "authenticator_app",
    get label() { return tStatic(DATA_IDP_SECURITY_MODULE, "MFA_CONFIG.AUTHENTICATOR_APP"); },
    Icon: Smartphone,
    status: false,
    type: 1,
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "MFA_CONFIG.USE_AN_AUTHENTICATION_APP_OR_BROWSER"); },
  },
];
