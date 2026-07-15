import { describe, expect, it } from "vitest";
import { signupFormSchema, signupFormDefaultValue } from "./utils";

describe("signup form schema", () => {
  it("exposes an empty default email", () => {
    expect(signupFormDefaultValue).toEqual({ email: "" });
  });

  it("accepts a valid email", () => {
    expect(
      signupFormSchema.safeParse({ email: "ada@example.com" }).success,
    ).toBe(true);
  });

  it("rejects an empty email", () => {
    const result = signupFormSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email");
    }
  });

  it("rejects a malformed email", () => {
    expect(signupFormSchema.safeParse({ email: "ada@" }).success).toBe(false);
  });
});
