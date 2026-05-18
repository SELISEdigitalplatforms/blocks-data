import { http } from "@/lib/http-client";
import { API_BASES } from "@/constants/endpoint.constant";

const IMPERSONATION_BASE = `${API_BASES.IDP}/auth`;

export interface ImpersonationRequest {
  targetTenantId: string;
  orgId?: string;
  organizationId?: string;
}

export interface ImpersonationState {
  rootTenantId: string;
  targetTenantId: string;
  orgId: string;
  startedAtUtc: string;
}

class ImpersonationService {
  startImpersonation(
    request: ImpersonationRequest,
  ): Promise<ImpersonationState> {
    return http.post(`${IMPERSONATION_BASE}/impersonate`, request, undefined, {
      absoluteUrl: true,
    });
  }

  stopImpersonation(): Promise<void> {
    return http.post(
      `${IMPERSONATION_BASE}/impersonation/stop`,
      null,
      undefined,
      {
        absoluteUrl: true,
      },
    );
  }
}

export const impersonationService = new ImpersonationService();
