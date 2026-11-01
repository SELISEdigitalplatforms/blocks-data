const Google = "/assets/images/social-media-google.png";
const Microsoft = "/assets/images/social-media-ms.png";
const GithubDark = "/assets/images/github-dark-mode.png";
const Github = "/assets/images/social-media-github.png";
const LinkedIn = "/assets/images/social-media-in.png";
const AppleDark = "/assets/images/apple-dark-mode-logo.png";
const Apple = "/assets/images/social-media-apple.png";
const Facebook = "/assets/images/social-media-facebook.png";
const Selise = "/assets/images/selise-globe-logo.png";
const XDark = "/assets/images/twitter-x-dark-mode-logo.png";
const X = "/assets/images/twitter-x-light-mode-logo.png";
import {
  ISsoProviderConfigurationWithMeta,
  ISsoProviderFrontendMeta,
} from "@blocks-idp/authentication/models/sso.model";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export enum SSO_PROVIDERS {
  google = "google",
  microsoft = "microsoft",
  github = "github",
  linkedin = "linkedin",
  x = "x",
  apple = "apple",
  facebook = "facebook",
  ownsso = "ownsso",
}

/** Shared empty defaults for all provider configuration fields. */
const PROVIDER_DEFAULTS: Omit<
  ISsoProviderConfigurationWithMeta,
  keyof ISsoProviderFrontendMeta | "provider"
> = {
  itemId: "",
  createdDate: "",
  lastUpdatedDate: "",
  createdBy: "",
  lastUpdatedBy: "",
  language: "en",
  organizationIds: [],
  tags: [],
  audience: "",
  clientId: "",
  clientSecret: "",
  authorizationUrl: "",
  tokenUrl: "",
  getProfileUrl: "",
  redirectUrl: "",
  scope: [],
  initialRoles: [],
  initialPermissions: [],
  isDisabled: false,
  userRoles: [],
  userPermissions: [],
};

/**
 * Creates a fully-typed provider config by merging shared defaults with
 * provider-specific metadata. Eliminates the ~20-field boilerplate per entry.
 */
function createProviderConfig(
  provider: SSO_PROVIDERS,
  meta: ISsoProviderFrontendMeta,
): ISsoProviderConfigurationWithMeta {
  return { ...PROVIDER_DEFAULTS, provider, ...meta };
}

export const SOCIAL_AUTH_PROVIDERS_CONFIG: Record<
  SSO_PROVIDERS,
  ISsoProviderConfigurationWithMeta
> = {
  github: createProviderConfig(SSO_PROVIDERS.github, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.GITHUB"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.ENABLE_THE_GITHUB_LOGIN_OPTION_FOR"); },
    imageSrc: Github,
    imageSrcDark: GithubDark,
    isAvailable: true,
    isConfigured: false,
  }),
  google: createProviderConfig(SSO_PROVIDERS.google, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.GOOGLE"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.ALLOW_YOUR_USERS_TO_SEAMLESSLY_LOG"); },
    imageSrc: Google,
    isAvailable: true,
    isConfigured: false,
  }),
  microsoft: createProviderConfig(SSO_PROVIDERS.microsoft, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.MICROSOFT"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.ENABLE_YOUR_USERS_TO_SECURELY_SIGN"); },
    imageSrc: Microsoft,
    isAvailable: true,
    isConfigured: false,
  }),
  linkedin: createProviderConfig(SSO_PROVIDERS.linkedin, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.LINKEDIN"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.LEVERAGE_THE_LARGEST_PROFESSIONAL"); },
    imageSrc: LinkedIn,
    isAvailable: true,
    isConfigured: false,
  }),
  x: createProviderConfig(SSO_PROVIDERS.x, {
    label: "X",
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.TWITTER_ALLOWS_USERS_TO_ENJOY_THE"); },
    imageSrc: X,
    imageSrcDark: XDark,
    isAvailable: true,
    isConfigured: false,
  }),
  apple: createProviderConfig(SSO_PROVIDERS.apple, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.APPLE"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.THE_EASY_WAY_TO_ADD_SIGN"); },
    imageSrc: Apple,
    imageSrcDark: AppleDark,
    isAvailable: true,
    isConfigured: false,
  }),
  facebook: createProviderConfig(SSO_PROVIDERS.facebook, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.FACEBOOK"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.A_FAST_AND_CONVENIENT_WAY_FOR"); },
    imageSrc: Facebook,
    isAvailable: false,
    isConfigured: false,
  }),
  ownsso: createProviderConfig(SSO_PROVIDERS.ownsso, {
    get label() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.BRING_YOUR_OWN_SSO"); },
    get description() { return tStatic("data.idp.authentication", "SSO_PROVIDERS_CONSTANT.BRING_YOUR_OWN_SSO_PROVIDER"); },
    imageSrc: Selise,
    isAvailable: true,
    isConfigured: false,
  }),
};
