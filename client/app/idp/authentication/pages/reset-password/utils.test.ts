import { describe, expect, it } from "vitest";
import { activationFormSchema, activationFormDefaultValue } from "./utils";

describe("reset-password form schema", () => {
  it("exposes empty default values", () => {
    expect(activationFormDefaultValue).toEqual({
      password: "",
      confirmPassword: "",
    });
  });

  it("accepts a strong matching password", () => {
    const result = activationFormSchema.safeParse({
      password: "Str0ng!Pass",
      confirmPassword: "Str0ng!Pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a weak password", () => {
    const result = activationFormSchema.safeParse({
      password: "weakpass",
      confirmPassword: "weakpass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = activationFormSchema.safeParse({
      password: "Str0ng!Pass",
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(
        true,
      );
    }
  });
});
