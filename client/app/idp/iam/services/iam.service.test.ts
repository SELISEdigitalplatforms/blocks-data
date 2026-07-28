import { describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";

// permission/organization services (composed here) resolve URLs via the http client.
vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { iamService } from "./iam.service";
import { PermissionService } from "./permission.service";
import { OrganizationService } from "./organization.service";

describe("iamService", () => {
  it("composes a PermissionService and an OrganizationService", () => {
    expect(iamService.permission).toBeInstanceOf(PermissionService);
    expect(iamService.organization).toBeInstanceOf(OrganizationService);
  });

  it("exposes the underlying service methods", () => {
    expect(typeof iamService.permission.getPermissions).toBe("function");
    expect(typeof iamService.organization.getOrganizations).toBe("function");
  });
});
