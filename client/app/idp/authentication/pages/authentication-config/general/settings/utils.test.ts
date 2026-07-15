import { describe, expect, it } from "vitest";
import { authConfigFormSchema, authConfigFormDefaultValues } from "./utils";

const base = {
  refreshTokenValidForNumberMinutes: 60,
  getNumberOfWrongAttemptsToLockTheAccount: 5,
  accountLockDurationInMinutes: 15,
  accessTokenValidForNumberMinutes: 30,
  rememberMeRefreshTokenValidForNumberMinutes: 120,
};

describe("auth settings form schema", () => {
  it("exposes zeroed default values", () => {
    expect(authConfigFormDefaultValues.refreshTokenValidForNumberMinutes).toBe(
      0,
    );
    expect(authConfigFormDefaultValues.accessTokenValidForNumberMinutes).toBe(
      0,
    );
  });

  it("accepts fully valid positive integers", () => {
    expect(authConfigFormSchema.safeParse(base).success).toBe(true);
  });

  it("coerces numeric strings", () => {
    const result = authConfigFormSchema.safeParse({
      ...base,
      accessTokenValidForNumberMinutes: "45",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessTokenValidForNumberMinutes).toBe(45);
    }
  });

  it("rejects a zero value (must be positive)", () => {
    const result = authConfigFormSchema.safeParse({
      ...base,
      refreshTokenValidForNumberMinutes: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Must be a positive number.");
    }
  });

  it("rejects a negative value", () => {
    expect(
      authConfigFormSchema.safeParse({
        ...base,
        accountLockDurationInMinutes: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional value (must be an integer)", () => {
    const result = authConfigFormSchema.safeParse({
      ...base,
      accountLockDurationInMinutes: 2.5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Must be a whole number.");
    }
  });

  it("rejects a value beyond the allowed max", () => {
    expect(
      authConfigFormSchema.safeParse({
        ...base,
        accessTokenValidForNumberMinutes: 2147483648,
      }).success,
    ).toBe(false);
  });
});
