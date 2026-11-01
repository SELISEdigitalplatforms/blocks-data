import { tStatic } from "@seliseblocks/genesis-os/i18n";
export const CAPTCHA_PROVIDERS = {
  recaptcha: { value: "recaptcha", get label() { return tStatic("data.idp.security", "CAPTCHA.GOOGLE_RECAPTCHA"); } },
  hcaptcha: { value: "hcaptcha", label: "hCAPTCHA" },
} as const;
export const CAPTCHA_GENERATOR_TYPE = {
  EasyCaptchaGenerator: { value: "EasyCaptchaGenerator", get label() { return tStatic("data.idp.security", "CAPTCHA.EASY"); } },
  HardCaptchaGenerator: { value: "HardCaptchaGenerator", get label() { return tStatic("data.idp.security", "CAPTCHA.HARD"); } },
} as const;

export type CAPTCHA_PROVIDERS_KEY = keyof typeof CAPTCHA_PROVIDERS;

export interface ICaptchaConfig {
  itemId: string;
  createdDate: string;
  lastUpdatedDate: string;
  createdBy: string;
  lastUpdatedBy: string;
  organizationIds: string[];
  tags: string[];
  captchaKey: string;
  captchaSecret: string;
  provider: CAPTCHA_PROVIDERS_KEY;
  captchaGenerator: keyof typeof CAPTCHA_GENERATOR_TYPE;
  isEnable: boolean;
}

export interface IGetCaptchaConfigsPayload {
  projectKey: string;
}
export interface IGetCaptchaConfigsResponse {
  configurations: ICaptchaConfig[];
}

export interface ISaveCaptchaConfigsPayload {
  captchaKey: string;
  captchaSecret: string;
  provider: string;
  captchaGenerator: string;
  isEnable: boolean;
  projectKey: string;
}
export interface ISaveCaptchaConfigsResponse {
  errors: unknown;
  isSuccess: boolean;
  itemId: string;
}

export interface IEnableCaptchaConfigsStatusPayload {
  itemId: string;
  isEnable: boolean;
  projectKey: string;
}

export interface IEnableCaptchaConfigsStatusResponse extends ISaveCaptchaConfigsResponse {}
