import { describe, expect, it } from "vitest";
import { permissionFormSchema } from "./utils";
import { PermissionSeverityLevel } from "@blocks-idp/iam/models/permission";

const base = {
  name: "Read Users",
  type: 2,
  resource: "users",
  resourceGroup: "iam",
  tags: [] as string[],
  description: "",
  dependentPermissions: [] as string[],
  permissionSeverity: PermissionSeverityLevel.High,
};

describe("permissionFormSchema", () => {
  it("accepts a valid permission", () => {
    expect(permissionFormSchema.safeParse(base).success).toBe(true);
  });

  it("requires a valid severity", () => {
    expect(
      permissionFormSchema.safeParse({
        ...base,
        permissionSeverity: "" as never,
      }).success,
    ).toBe(false);
  });

  it("coerces the numeric type and requires >= 1", () => {
    expect(
      permissionFormSchema.safeParse({ ...base, type: 0 }).success,
    ).toBe(false);
  });

  it("enforces the resource format for type 1", () => {
    expect(
      permissionFormSchema.safeParse({
        ...base,
        type: 1,
        resource: "svc::ctrl::name",
      }).success,
    ).toBe(true);
    expect(
      permissionFormSchema.safeParse({
        ...base,
        type: 1,
        resource: "nope",
      }).success,
    ).toBe(false);
  });

  it("rejects resources with spaces", () => {
    expect(
      permissionFormSchema.safeParse({ ...base, resource: "a b" }).success,
    ).toBe(false);
  });
});
