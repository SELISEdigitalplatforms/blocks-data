import {
  PEOPLE_ENDPOINTS,
  PROJECT_ENDPOINTS,
} from "@/identifier/constants/endpoint.constant";
import { IGetProjectLoginOptionResponse } from "@/identifier/models/project.model";
import { http } from "@/lib/http-client";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { useAuthStore } from "@/store/useAuthStore";
import { GRANT_TYPES } from "../constants/authentication.constant";
import {
  AUTH_ENDPOINTS,
  AUTH_OIDC_ENDPOINTS,
} from "../constants/endpoint.constant";
import type {
  ISigninByEmailPayload,
  ISigninByEmailResponse,
  ISignupByEmailPayload,
  ISignupByEmailResponse,
  IVerifyMfaPayload,
  IVerifyMfaResponse,
} from "../models/auth.model";

export interface IVerifyOidcPayload {
  code: string;
  state: string;
}

export class AuthService {
  signinByEmail(
    payload: ISigninByEmailPayload,
  ): Promise<ISigninByEmailResponse> {
    const body = new URLSearchParams();
    body.append("grant_type", GRANT_TYPES.password);
    body.append("username", payload.username);
    body.append("password", payload.password);
    if (payload.clientId) body.append("client_id", payload.clientId);
    if (payload.state) body.append("state", payload.state);
    if (payload.nonce) body.append("nonce", payload.nonce);
    if (payload.scope) body.append("scope", payload.scope);
    if (payload.redirectUri) body.append("redirect_uri", payload.redirectUri);

    return http.post(
      AUTH_ENDPOINTS.TOKEN,
      body,
      { "Content-Type": "application/x-www-form-urlencoded" },
      { skipTokenRotation: true },
    );
  }

  verifyMfa(payload: IVerifyMfaPayload): Promise<IVerifyMfaResponse> {
    const body = new URLSearchParams();
    body.append("grant_type", "mfa_code");
    body.append("code", payload.code);
    body.append("mfa_id", payload.mfa_id);
    body.append("mfa_type", payload.mfa_type.toString());

    return http.post(AUTH_ENDPOINTS.TOKEN, body, {
      "Content-Type": "application/x-www-form-urlencoded",
    });
  }

  signupByEmail(
    payload: ISignupByEmailPayload,
  ): Promise<ISignupByEmailResponse> {
    return http.post(PEOPLE_ENDPOINTS.SIGNUP, payload);
  }

  getLoginOptions(): Promise<IGetProjectLoginOptionResponse> {
    return http.get(PROJECT_ENDPOINTS.GET_LOGIN_OPTIONS);
  }

  verifyOidc(payload: IVerifyOidcPayload): Promise<IVerifyMfaResponse> {
    const body = new URLSearchParams();
    body.append("grant_type", GRANT_TYPES.authorizationCode);
    body.append("code", payload.code);
    body.append("state", payload.state);

    return http.post(
      AUTH_OIDC_ENDPOINTS.OIDC_TOKEN,
      body,
      { "Content-Type": "application/x-www-form-urlencoded" },
      { skipTokenRotation: true },
    );
  }

  logout() {
    const isLocalhost = getRuntimeEnv("BLOCKS_DATA_BASE_URL")?.includes(
      "localhost",
    );
    const refreshToken = isLocalhost
      ? useAuthStore.getState().refreshToken || ""
      : "";
    return http.post(AUTH_ENDPOINTS.LOGOUT, { refreshToken }, undefined, {
      absoluteUrl: true,
    });
  }
}

export const authService = new AuthService();
