import { describe, expect, it } from "vitest";
import { updateOrganizationFormSchema } from "./utils";

describe("update-organization form schema", () => {
  it("accepts a valid name", () => {
    expect(
      updateOrganizationFormSchema.safeParse({ name: "Acme" }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = updateOrganizationFormSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Name is required");
    }
  });

  it("rejects a name longer than 100 characters", () => {
    const result = updateOrganizationFormSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Name must be at most 100 characters",
      );
    }
  });

  it("trims surrounding whitespace from the parsed value", () => {
    const result = updateOrganizationFormSchema.safeParse({ name: "  Acme  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme");
    }
  });
});
