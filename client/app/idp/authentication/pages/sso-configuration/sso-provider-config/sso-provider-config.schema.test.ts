import { describe, expect, it } from "vitest";
import {
  ssoRoleSchema,
  ssoPermissionSchema,
  ssoProviderConfigBaseSchema,
  ssoOAuthProviderSchema,
} from "./sso-provider-config.schema";

describe("sso-provider-config schemas", () => {
  describe("ssoRoleSchema", () => {
    it("accepts a complete role", () => {
      expect(
        ssoRoleSchema.safeParse({
          itemId: "1",
          name: "Admin",
          slug: "admin",
          description: "desc",
        }).success,
      ).toBe(true);
    });

    it("rejects a role missing a field", () => {
      expect(
        ssoRoleSchema.safeParse({ itemId: "1", name: "Admin" }).success,
      ).toBe(false);
    });
  });

  describe("ssoPermissionSchema", () => {
    it("accepts a complete permission", () => {
      expect(
        ssoPermissionSchema.safeParse({
          itemId: "1",
          name: "read",
          description: "desc",
        }).success,
      ).toBe(true);
    });
  });

  describe("ssoProviderConfigBaseSchema", () => {
    const base = {
      provider: "google",
      audience: "https://api.example.com",
      redirectUrl: "https://app.example.com/cb",
    };

    it("accepts valid base config", () => {
      expect(ssoProviderConfigBaseSchema.safeParse(base).success).toBe(true);
    });

    it("rejects an invalid audience URL", () => {
      const result = ssoProviderConfigBaseSchema.safeParse({
        ...base,
        audience: "not-a-url",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Audience URL must be a valid URL.",
        );
      }
    });

    it("rejects an invalid redirect URL", () => {
      const result = ssoProviderConfigBaseSchema.safeParse({
        ...base,
        redirectUrl: "nope",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Redirect URL must be a valid URL.",
        );
      }
    });
  });

  describe("ssoOAuthProviderSchema", () => {
    const base = {
      provider: "google",
      audience: "https://api.example.com",
      redirectUrl: "https://app.example.com/cb",
      clientId: "client-id",
      clientSecret: "client-secret",
      userRoles: [],
      userPermissions: [],
    };

    it("accepts a valid OAuth provider config", () => {
      expect(ssoOAuthProviderSchema.safeParse(base).success).toBe(true);
    });

    it("accepts optional initial roles and permissions", () => {
      expect(
        ssoOAuthProviderSchema.safeParse({
          ...base,
          initialRoles: ["r1"],
          initialPermissions: ["p1"],
        }).success,
      ).toBe(true);
    });

    it("requires a client id", () => {
      const result = ssoOAuthProviderSchema.safeParse({
        ...base,
        clientId: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message === "Client id is required"),
        ).toBe(true);
      }
    });

    it("requires a client secret", () => {
      const result = ssoOAuthProviderSchema.safeParse({
        ...base,
        clientSecret: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message === "Client secret is required",
          ),
        ).toBe(true);
      }
    });

    it("validates nested user roles", () => {
      expect(
        ssoOAuthProviderSchema.safeParse({
          ...base,
          userRoles: [{ itemId: "1", name: "Admin" }],
        }).success,
      ).toBe(false);
    });
  });
});
