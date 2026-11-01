import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_SHARED_MODULE = "data.shared";
export const environmentOptions = [
  { index: 0, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.DEVELOPMENT"); }, value: "dev", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_DAY_TO_DAY_DEVELOPMENT_AND"); } },
  { index: 1, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.TESTING"); }, value: "test", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_QA_TESTING_AND_VALIDATION_OF"); } },
  { index: 2, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.STAGING"); }, value: "stg", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_FINAL_PRE_PROD_VALIDATION_IN"); } },
  { index: 3, label: "IAT", value: "iat", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_TESTING_SERVICE_INTEGRATIONS"); } },
  { index: 4, label: "UAT", value: "uat", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_END_USER_OR_STAKEHOLDER_VALIDATION"); } },
  { index: 5, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.PROD_SHADOW"); }, value: "prod-shadow", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_MIRRORING_PRODUCTION_DATA_TRAFFIC"); } },
  { index: 6, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.PRE_PROD"); }, value: "pre-prod", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.FOR_LOAD_TESTING_SECURITY_CHECKS_OR"); } },
  { index: 7, get label() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.PRODUCTION"); }, value: "prod", get subtext() { return tStatic(DATA_SHARED_MODULE, "ENVIRONMENT_OPTIONS.THE_LIVE_ENVIRONMENT_SERVING_ACTUAL"); } },
];
