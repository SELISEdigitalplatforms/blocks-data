import { describe, expect, it } from "vitest";
import { inviteUserFormSchema, inviteUserFormDefaultValue } from "./utils";

const base = {
  firstName: "Ada",
  lastName: "Lovelace",
};

describe("update-user form schema", () => {
  it("exposes empty default values", () => {
    expect(inviteUserFormDefaultValue).toEqual({
      firstName: "",
      lastName: "",
    });
  });

  it("accepts valid names", () => {
    expect(inviteUserFormSchema.safeParse(base).success).toBe(true);
  });

  it("requires a first name", () => {
    const result = inviteUserFormSchema.safeParse({ ...base, firstName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("First name is required");
    }
  });

  it("requires a last name", () => {
    const result = inviteUserFormSchema.safeParse({ ...base, lastName: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Last name is required");
    }
  });

  it("rejects a last name longer than 150 characters", () => {
    expect(
      inviteUserFormSchema.safeParse({ ...base, lastName: "a".repeat(151) })
        .success,
    ).toBe(false);
  });
});
