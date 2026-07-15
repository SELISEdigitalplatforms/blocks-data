import { describe, expect, it } from "vitest";
import { updateRoleFormSchema, updateRoleFormDefaultValue } from "./utils";

describe("update-role form schema", () => {
  it("exposes empty default values", () => {
    expect(updateRoleFormDefaultValue).toEqual({
      name: "",
      description: "",
    });
  });

  it("accepts a valid update", () => {
    expect(
      updateRoleFormSchema.safeParse({ name: "Editor", description: "x" })
        .success,
    ).toBe(true);
  });

  it("allows an omitted (optional) description", () => {
    expect(updateRoleFormSchema.safeParse({ name: "Editor" }).success).toBe(
      true,
    );
  });

  it("rejects a whitespace-only name", () => {
    const result = updateRoleFormSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Name field must not be empty",
      );
    }
  });

  it("rejects a name longer than 50 characters", () => {
    expect(
      updateRoleFormSchema.safeParse({ name: "a".repeat(51) }).success,
    ).toBe(false);
  });

  it("rejects a description longer than 150 characters", () => {
    expect(
      updateRoleFormSchema.safeParse({
        name: "Editor",
        description: "a".repeat(151),
      }).success,
    ).toBe(false);
  });
});
