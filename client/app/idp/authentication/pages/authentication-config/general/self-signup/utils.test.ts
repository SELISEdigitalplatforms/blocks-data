import { describe, expect, it } from "vitest";
import { selfSignUpFormSchema, selfSignUpFormDefaultValues } from "./utils";

describe("self-signup form schema", () => {
  it("defaults to disabled self signup", () => {
    expect(selfSignUpFormDefaultValues).toEqual({ isSelfSignUpAllowed: false });
  });

  it("accepts a boolean value", () => {
    expect(
      selfSignUpFormSchema.safeParse({ isSelfSignUpAllowed: true }).success,
    ).toBe(true);
    expect(
      selfSignUpFormSchema.safeParse({ isSelfSignUpAllowed: false }).success,
    ).toBe(true);
  });

  it("rejects a non-boolean value", () => {
    expect(
      selfSignUpFormSchema.safeParse({
        isSelfSignUpAllowed: "true" as never,
      }).success,
    ).toBe(false);
  });
});
