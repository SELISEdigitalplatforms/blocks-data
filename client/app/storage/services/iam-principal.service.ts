import { serviceInstances } from "@/lib/http-client";
import { IAM_ENDPOINTS } from "../constants/endpoint.constant";
import { toQuery } from "./dms-directory.service";

/**
 * IAM-backed principal pickers.
 *
 * Backs the manage-access dialog: rather than ask for an opaque user id / role
 * slug / organization id, we list real principals from IAM and let the user pick.
 *
 * The three IAM endpoints are not consistent in shape (see the swagger), so each
 * call here adapts its own response envelope into a single normalized option:
 *   { value: principalId, label: display name }
 * — `value` is what the GrantAccess DTO's `principalId` needs (user id / role
 * slug / organization id), `label` is what the user sees.
 */

/** Normalized option surfaced to the principal picker. */
export interface IamPrincipalOption {
  /** The identifier the access grant expects (`userId` / role `slug` / org `itemId`). */
  value: string;
  /** Human-readable label for the dropdown. */
  label: string;
  /** Optional secondary line (email, slug, shortCode) for disambiguation. */
  description?: string;
}

// ---- IAM wire shapes (subset of the swagger; only the fields we read) ----

interface IamUserWire {
  // The actual API returns `itemId` (not `userId` as the swagger implies).
  itemId?: string | null;
  email?: string | null;
  userName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface IamRoleWire {
  itemId?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
}

interface IamOrganizationWire {
  itemId?: string | null;
  name?: string | null;
  shortCode?: string | null;
  description?: string | null;
}

interface IamUsersResponse {
  data?: IamUserWire[] | null;
  totalCount?: number;
}

interface IamRolesResponse {
  data?: IamRoleWire[] | null;
  totalCount?: number;
}

interface IamOrganizationsResponse {
  organizations?: IamOrganizationWire[] | null;
  isSuccess?: boolean;
  totalCount?: number;
}

const fullName = (u: IamUserWire): string => {
  const joined = [u.firstName, u.lastName].filter((part) => !!part?.trim()).join(" ");
  return joined || u.email || u.userName || u.itemId || "";
};

export class IamPrincipalService {
  /**
   * Lists users, optional `search` matches email or name server-side. The IAM
   * endpoint is a POST with a JSON filter body (not query params). Pagination is
   * zero-indexed.
   */
  async getUsers(search?: string, pageSize = 50): Promise<IamPrincipalOption[]> {
    const filter = search?.trim()
      ? { email: search.trim(), name: search.trim() }
      : undefined;

    const res: IamUsersResponse = await serviceInstances.idpService.post(IAM_ENDPOINTS.USERS, {
      page: 0,
      pageSize,
      filter,
    });

    return (res.data ?? [])
      .filter((u) => !!u.itemId)
      .map((u) => ({
        value: u.itemId as string,
        label: fullName(u),
        description: u.email ?? undefined,
      }));
  }

  /**
   * Lists roles. Roles expose both `itemId` and `slug`; the access engine keys
   * off the role **slug** (the principal id carried in `BlocksContext.Roles`),
   * so `slug` is the value we hand back. POST with a JSON filter body.
   */
  async getRoles(search?: string, pageSize = 50): Promise<IamPrincipalOption[]> {
    const filter = search?.trim() ? { search: search.trim() } : undefined;

    const res: IamRolesResponse = await serviceInstances.idpService.post(IAM_ENDPOINTS.ROLES, {
      page: 0,
      pageSize,
      filter,
    });

    return (res.data ?? [])
      .filter((r) => !!r.slug)
      .map((r) => ({
        value: r.slug as string,
        label: r.name || r.slug || "",
        description: r.description ?? undefined,
      }));
  }

  /**
   * Lists organizations. GET with PascalCase query params. The access engine
   * matches the active org id, so `itemId` is the value we return.
   */
  async getOrganizations(search?: string, pageSize = 50): Promise<IamPrincipalOption[]> {
    const res: IamOrganizationsResponse = await serviceInstances.idpService.get(
      `${IAM_ENDPOINTS.ORGANIZATIONS}${toQuery({
        Page: 0,
        PageSize: pageSize,
        "Filter.Search": search?.trim() || undefined,
      })}`,
    );

    return (res.organizations ?? [])
      .filter((o) => !!o.itemId)
      .map((o) => ({
        value: o.itemId as string,
        label: o.name || o.shortCode || o.itemId || "",
        description: o.shortCode ?? undefined,
      }));
  }
}

export const iamPrincipalService = new IamPrincipalService();
