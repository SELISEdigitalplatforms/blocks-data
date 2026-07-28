import { describe, expect, it } from "vitest";
import {
  authGrantTypeFormSchema,
  authGrantTypeFormDefaultValues,
} from "./utils";

describe("grant-types form schema", () => {
  it("exposes an empty default list", () => {
    expect(authGrantTypeFormDefaultValues).toEqual({ allowedGrantTypes: [] });
  });

  it("accepts at least one grant type", () => {
    expect(
      authGrantTypeFormSchema.safeParse({
        allowedGrantTypes: ["authorization_code"],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(
      authGrantTypeFormSchema.safeParse({ allowedGrantTypes: [] }).success,
    ).toBe(false);
  });

  it("rejects non-string entries", () => {
    expect(
      authGrantTypeFormSchema.safeParse({ allowedGrantTypes: [1 as never] })
        .success,
    ).toBe(false);
  });
});
