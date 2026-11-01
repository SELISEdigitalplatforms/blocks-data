import { API_BASES } from "@/constants/endpoint.constant";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_SECURITY_MODULE = "data.idp.security";

const API_ENDPOINT_CONFIG_SUBPATH = "/ApiEndpointConfig";

export const API_SETTINGS_ENDPOINTS = {
  GET_LIST: `${API_BASES.CLOUD_CONFIGURATION}${API_ENDPOINT_CONFIG_SUBPATH}/GetList`,
  UPDATE: `${API_BASES.CLOUD_CONFIGURATION}${API_ENDPOINT_CONFIG_SUBPATH}/Update`,
  BULK_UPDATE: `${API_BASES.CLOUD_CONFIGURATION}${API_ENDPOINT_CONFIG_SUBPATH}/BulkUpdate`,
  REMOVE: `${API_BASES.CLOUD_CONFIGURATION}${API_ENDPOINT_CONFIG_SUBPATH}/Remove`,
} as const;

/** Client-side metadata for known service groups. */
export const SERVICE_META: Record<string, { description: string; icon: string }> = {
  Authentication: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.AUTHENTICATION_AND_USER_IDENTITY"); },
    icon: "Lock",
  },
  Captcha: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.CAPTCHA_VERIFICATION_AND_CHALLENGE"); },
    icon: "Shield",
  },
  Iam: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.IDENTITY_AND_ACCESS_MANAGEMENT"); },
    icon: "Users",
  },
  Mfa: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.MULTI_FACTOR_AUTHENTICATION_ENDPOINTS"); },
    icon: "Smartphone",
  },
  Storage: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.S3_COMPATIBLE_OBJECT_STORAGE_AND"); },
    icon: "HardDrive",
  },
  Communication: {
    get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.EMAIL_SMS_AND_NOTIFICATION_DELIVERY"); },
    icon: "Mail",
  },
};

export const DEFAULT_SERVICE_META = {
  get description() { return tStatic(DATA_IDP_SECURITY_MODULE, "ENDPOINT_CONSTANT.SERVICE_ENDPOINTS"); },
  icon: "Settings",
};
