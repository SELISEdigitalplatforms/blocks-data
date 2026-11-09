import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";
export const UserCreationType: Record<number, string> = {
  get 0() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.NONE"); },
  get 1() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.PORTAL"); },
  2: "API",
  get 3() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.SERVICE"); },
  get 4() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.SOCIAL"); },
};

export enum GRANT_TYPES {
  password = "password",
  social = "social",
  clientCredential = "client_credential",
  authorizationCode = "authorization_code",
}

export const GRANT_TYPES_OPTIONS: { id: GRANT_TYPES; label: string; value: string }[] = [
  { id: GRANT_TYPES.password, label: "Email/Password", value: GRANT_TYPES.password },
  { id: GRANT_TYPES.social, label: "SSO", value: GRANT_TYPES.social },
  {
    id: GRANT_TYPES.clientCredential,
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.CLIENT_CREDENTIAL"); },
    value: GRANT_TYPES.clientCredential,
  },
  {
    id: GRANT_TYPES.authorizationCode,
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.AUTHORIZATION_CODE"); },
    value: GRANT_TYPES.authorizationCode,
  },
];

export const AuthenticationTabs: { id: string; label: string; value: string }[] = [
  { id: "general", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.GENERAL"); }, value: "general" },
  { id: "signin-flow", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.SIGNIN_FLOW"); }, value: "signin-flow" },
  { id: "signup-flow", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.SIGNUP_FLOW"); }, value: "signup-flow" },
  { id: "oidc-template", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.OIDC_TEMPLATE"); }, value: "oidc-template" },
  { id: "roles", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.ROLES"); }, value: "roles" },
  { id: "permissions", get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.PERMISSIONS"); }, value: "permissions" },
  // {
  //   id: GRANT_TYPES.clientCredential,
  //   label: "Client Credential",
  //   value: GRANT_TYPES.clientCredential,
  // },
];

export const SecretManagementTabs: { id: string; label: string; value: string }[] = [
  {
    id: "infra-config",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.INFRA_CONFIG"); },
    value: "infra-config",
  },
  {
    id: "my-secret",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.MY_SECRET"); },
    value: "my-secret",
  },
  {
    id: "managed-services",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.MY_SERVICE"); },
    value: "managed-services",
  },
  {
    id: GRANT_TYPES.authorizationCode,
    label: "OIDC",
    value: GRANT_TYPES.authorizationCode,
  },
  {
    id: GRANT_TYPES.social,
    label: "SSO",
    value: GRANT_TYPES.social,
  },
  {
    id: "external-idp",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.EXTERNAL_IDP"); },
    value: "external-idp",
  },
  {
    id: "captcha",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.CAPTCHA"); },
    value: "captcha",
  },
  {
    id: "mfa",
    label: "MFA",
    value: "mfa",
  },
  {
    id: "magic-url",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.MAGIC_URL"); },
    value: "magic-url",
  },
  {
    id: "storage",
    get label() { return tStatic(DATA_IDP_AUTHENTICATION_MODULE, "AUTHENTICATION_CONSTANT.STORAGE"); },
    value: "storage",
  },
];

export const providers = [
  { id: "keycloak", name: "Keycloak", icon: "/assets/images/keycloak_icon.png" },
  { id: "okta", name: "Okta", icon: "/assets/images/okta_symbol.png" },
  { id: "auth0", name: "Auth0", icon: "/assets/images/auth0.png" },
  { id: "azure", name: "Azure", icon: "/assets/images/azure.png" },
  { id: "others", name: "Others", icon: "" },
];
