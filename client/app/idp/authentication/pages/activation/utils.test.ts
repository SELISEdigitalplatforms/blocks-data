import { describe, expect, it } from "vitest";
import { activationFormSchema, activationFormDefaultValue } from "./utils";

describe("activation form schema", () => {
  it("exposes empty default values", () => {
    expect(activationFormDefaultValue).toEqual({
      firstname: "",
      lastname: "",
      password: "",
      confirmPassword: "",
    });
  });

  it("accepts valid input and trims the password", () => {
    const result = activationFormSchema.safeParse({
      firstname: "Ada",
      lastname: "Lovelace",
      password: "secret",
      confirmPassword: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("requires first and last name", () => {
    const result = activationFormSchema.safeParse({
      firstname: "",
      lastname: "",
      password: "secret",
      confirmPassword: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects passwords containing whitespace", () => {
    const result = activationFormSchema.safeParse({
      firstname: "Ada",
      lastname: "Lovelace",
      password: "bad pass",
      confirmPassword: "bad pass",
    });
    expect(result.success).toBe(false);
  });
});
