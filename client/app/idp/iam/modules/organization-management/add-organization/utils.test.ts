import { describe, expect, it } from "vitest";
import {
  addOrganizationFormSchema,
  addOrganizationFormDefaultValue,
} from "./utils";

describe("add-organization form schema", () => {
  it("exposes an empty default name", () => {
    expect(addOrganizationFormDefaultValue).toEqual({ name: "" });
  });

  it("accepts a valid name", () => {
    expect(
      addOrganizationFormSchema.safeParse({ name: "Acme" }).success,
    ).toBe(true);
  });

  it("trims and rejects a whitespace-only name", () => {
    const result = addOrganizationFormSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Name is required");
    }
  });

  it("rejects an empty name", () => {
    expect(addOrganizationFormSchema.safeParse({ name: "" }).success).toBe(
      false,
    );
  });

  it("rejects a name longer than 100 characters", () => {
    const result = addOrganizationFormSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Name must be at most 100 characters",
      );
    }
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(
      addOrganizationFormSchema.safeParse({ name: "a".repeat(100) }).success,
    ).toBe(true);
  });
});
