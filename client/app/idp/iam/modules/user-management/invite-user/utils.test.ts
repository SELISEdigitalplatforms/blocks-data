import { describe, expect, it } from "vitest";
import { inviteUserFormSchema, inviteUserFormDefaultValue } from "./utils";

const base = {
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

describe("invite-user form schema", () => {
  it("exposes empty default values", () => {
    expect(inviteUserFormDefaultValue).toEqual({
      email: "",
      firstName: "",
      lastName: "",
    });
  });

  it("accepts a valid invite", () => {
    expect(inviteUserFormSchema.safeParse(base).success).toBe(true);
  });

  it("requires an email", () => {
    const result = inviteUserFormSchema.safeParse({ ...base, email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Email is required");
    }
  });

  it("rejects a malformed email", () => {
    const result = inviteUserFormSchema.safeParse({
      ...base,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Please enter a valid email address",
      );
    }
  });

  it("requires a first name", () => {
    expect(
      inviteUserFormSchema.safeParse({ ...base, firstName: "" }).success,
    ).toBe(false);
  });

  it("requires a last name", () => {
    expect(
      inviteUserFormSchema.safeParse({ ...base, lastName: "" }).success,
    ).toBe(false);
  });

  it("rejects a first name longer than 150 characters", () => {
    expect(
      inviteUserFormSchema.safeParse({ ...base, firstName: "a".repeat(151) })
        .success,
    ).toBe(false);
  });
});
