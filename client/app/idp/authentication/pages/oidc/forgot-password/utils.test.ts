import { describe, expect, it } from "vitest";
import {
  forgotPasswordFormSchema,
  forgotPasswordFormDefaultValue,
} from "./utils";

describe("oidc forgot-password form schema", () => {
  it("exposes an empty default email", () => {
    expect(forgotPasswordFormDefaultValue).toEqual({ email: "" });
  });

  it("accepts a valid email", () => {
    expect(
      forgotPasswordFormSchema.safeParse({ email: "ada@example.com" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = forgotPasswordFormSchema.safeParse({ email: "bad@" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email");
    }
  });
});
