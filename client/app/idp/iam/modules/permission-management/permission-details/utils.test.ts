import { describe, expect, it } from "vitest";
import { addPermissionFormSchema, addPermissionFormDefaultValue } from "./utils";

const base = {
  name: "Read Users",
  type: "0",
  resource: "users",
  resourceGroup: "iam",
  tags: [] as string[],
  dependentPermissions: [] as string[],
};

describe("addPermissionFormSchema", () => {
  it("exposes empty defaults", () => {
    expect(addPermissionFormDefaultValue.name).toBe("");
    expect(addPermissionFormDefaultValue.tags).toEqual([]);
  });

  it("accepts a valid non-typed-1 permission", () => {
    expect(addPermissionFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects resources containing spaces", () => {
    expect(
      addPermissionFormSchema.safeParse({ ...base, resource: "read users" })
        .success,
    ).toBe(false);
  });

  it("enforces the service::controller::name format for type 1", () => {
    expect(
      addPermissionFormSchema.safeParse({
        ...base,
        type: "1",
        resource: "svc::ctrl::name",
      }).success,
    ).toBe(true);

    expect(
      addPermissionFormSchema.safeParse({
        ...base,
        type: "1",
        resource: "invalidformat",
      }).success,
    ).toBe(false);
  });

  it("requires a name and group", () => {
    expect(
      addPermissionFormSchema.safeParse({ ...base, name: "" }).success,
    ).toBe(false);
    expect(
      addPermissionFormSchema.safeParse({ ...base, resourceGroup: "" }).success,
    ).toBe(false);
  });
});
