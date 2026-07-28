import { authHandlers } from "./auth-handler";
import { iamHandlers } from "./iam-handler";
import { captchaHandlers } from "./captcha-handler";
import { mfaHandlers } from "./mfa-handler";

/**
 * Aggregated IDP MSW handlers across all domains:
 * - Authentication (signin, signup, SSO, OIDC, client credentials, auth config)
 * - IAM (users, accounts, roles, permissions, organizations, configuration)
 * - Captcha (configuration management)
 * - MFA (configuration, OTP generation, TOTP setup, verification)
 */
export const idpHandlers = [...authHandlers, ...iamHandlers, ...captchaHandlers, ...mfaHandlers];
