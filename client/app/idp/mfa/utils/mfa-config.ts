import { Mail, Smartphone } from "lucide-react";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const MFA_Provider_Data = [
  {
    provider: "email",
    get label() { return tStatic("data.idp.security", "common:EMAIL"); },
    Icon: Mail,
    status: false,
    type: 2,
    get description() { return tStatic("data.idp.security", "MFA_CONFIG.RECEIVE_A_VERIFICATION_CODE_IN_YOUR"); },
  },
  {
    provider: "authenticator_app",
    get label() { return tStatic("data.idp.security", "MFA_CONFIG.AUTHENTICATOR_APP"); },
    Icon: Smartphone,
    status: false,
    type: 1,
    get description() { return tStatic("data.idp.security", "MFA_CONFIG.USE_AN_AUTHENTICATION_APP_OR_BROWSER"); },
  },
];
