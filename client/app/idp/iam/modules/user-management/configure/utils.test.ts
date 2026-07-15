import { describe, expect, it } from "vitest";
import { iamConfigFormSchema, iamConfigFormDefaultValues } from "./utils";

const base = {
  accountActivationUrl: "https://app.example.com/activate",
  accountVerificationUrl: "https://app.example.com/verify",
  recoverAccountUrl: "https://app.example.com/recover",
  activationUrlLifetimeInMinutes: 60,
  recoverAccountUrlLifetimeInMinutes: 30,
  logoutOnPasswordChange: true,
};

describe("iam configure form schema", () => {
  it("exposes sensible default values", () => {
    expect(iamConfigFormDefaultValues.logoutOnPasswordChange).toBe(true);
    expect(iamConfigFormDefaultValues.activationUrlLifetimeInMinutes).toBe(1);
  });

  it("accepts a fully valid config", () => {
    expect(iamConfigFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an invalid activation URL", () => {
    const result = iamConfigFormSchema.safeParse({
      ...base,
      accountActivationUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Account activation URL must be a valid URL.",
      );
    }
  });

  it("rejects an invalid verification URL", () => {
    expect(
      iamConfigFormSchema.safeParse({
        ...base,
        accountVerificationUrl: "nope",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid recover URL", () => {
    expect(
      iamConfigFormSchema.safeParse({ ...base, recoverAccountUrl: "nope" })
        .success,
    ).toBe(false);
  });

  it("coerces a numeric string lifetime", () => {
    const result = iamConfigFormSchema.safeParse({
      ...base,
      activationUrlLifetimeInMinutes: "120",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activationUrlLifetimeInMinutes).toBe(120);
    }
  });

  it("rejects a zero lifetime (not positive)", () => {
    expect(
      iamConfigFormSchema.safeParse({
        ...base,
        activationUrlLifetimeInMinutes: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional lifetime (not an integer)", () => {
    expect(
      iamConfigFormSchema.safeParse({
        ...base,
        recoverAccountUrlLifetimeInMinutes: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects a lifetime beyond the allowed max", () => {
    expect(
      iamConfigFormSchema.safeParse({
        ...base,
        activationUrlLifetimeInMinutes: 2147483648,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-boolean logoutOnPasswordChange", () => {
    expect(
      iamConfigFormSchema.safeParse({
        ...base,
        logoutOnPasswordChange: "yes" as never,
      }).success,
    ).toBe(false);
  });
});
