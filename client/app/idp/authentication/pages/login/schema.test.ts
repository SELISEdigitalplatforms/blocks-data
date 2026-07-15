import { describe, expect, it } from "vitest";
import { signinFormSchema, signinFormDefaultValue } from "./schema";

const base = {
  username: "ada@example.com",
  password: "secret",
};

describe("login (signin) form schema", () => {
  it("exposes empty default values", () => {
    expect(signinFormDefaultValue).toEqual({ username: "", password: "" });
  });

  it("accepts a valid credential pair", () => {
    expect(signinFormSchema.safeParse(base).success).toBe(true);
  });

  it("requires a username", () => {
    const result = signinFormSchema.safeParse({ ...base, username: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Email is required");
    }
  });

  it("rejects a malformed username email", () => {
    const result = signinFormSchema.safeParse({ ...base, username: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid email format");
    }
  });

  it("requires a password", () => {
    const result = signinFormSchema.safeParse({ ...base, password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });
});
