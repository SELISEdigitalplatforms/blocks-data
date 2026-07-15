import { describe, expect, it } from "vitest";
import { addRoleFormSchema, addRoleFormDefaultValue } from "./utils";

const base = {
  name: "Editor",
  slug: "editor",
  description: "Can edit",
};

describe("add-role form schema", () => {
  it("exposes empty default values", () => {
    expect(addRoleFormDefaultValue).toEqual({
      name: "",
      slug: "",
      description: "",
    });
  });

  it("accepts a valid role", () => {
    expect(addRoleFormSchema.safeParse(base).success).toBe(true);
  });

  it("allows an omitted (optional) description", () => {
    const { description, ...withoutDescription } = base;
    void description;
    expect(addRoleFormSchema.safeParse(withoutDescription).success).toBe(true);
  });

  it("requires a name", () => {
    const result = addRoleFormSchema.safeParse({ ...base, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Name is required");
    }
  });

  it("rejects a name longer than 50 characters", () => {
    expect(
      addRoleFormSchema.safeParse({ ...base, name: "a".repeat(51) }).success,
    ).toBe(false);
  });

  it("requires a slug", () => {
    const result = addRoleFormSchema.safeParse({ ...base, slug: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Slug is required");
    }
  });

  it("rejects a slug containing spaces", () => {
    const result = addRoleFormSchema.safeParse({ ...base, slug: "my role" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === "Slug can not contain spaces",
        ),
      ).toBe(true);
    }
  });

  it("rejects a description longer than 150 characters", () => {
    expect(
      addRoleFormSchema.safeParse({ ...base, description: "a".repeat(151) })
        .success,
    ).toBe(false);
  });
});
