import { describe, expect, it } from "vitest";
import { createOidcSchema, createOIDCFormDefaultValue } from "./utils";

const base = {
  redirectUrlOidc: "https://app.example.com/cb",
  audienceUrlOidc: "https://app.example.com",
  scope: "openid",
  clientDisplayName: "My Client",
};

describe("createOidcSchema", () => {
  it("provides sensible defaults", () => {
    expect(createOIDCFormDefaultValue.scope).toBe("openid");
    expect(createOIDCFormDefaultValue.clientBrandColor).toBe("#FFFFFF");
  });

  it("accepts https urls and a display name", () => {
    expect(createOidcSchema.safeParse(base).success).toBe(true);
  });

  it("allows http for localhost", () => {
    const result = createOidcSchema.safeParse({
      ...base,
      redirectUrlOidc: "http://localhost:3000/cb",
      audienceUrlOidc: "http://127.0.0.1/aud",
    });
    expect(result.success).toBe(true);
  });

  it("rejects http for non-localhost hosts", () => {
    const result = createOidcSchema.safeParse({
      ...base,
      redirectUrlOidc: "http://app.example.com/cb",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid url and a missing display name", () => {
    expect(
      createOidcSchema.safeParse({ ...base, redirectUrlOidc: "not-a-url" })
        .success,
    ).toBe(false);
    expect(
      createOidcSchema.safeParse({ ...base, clientDisplayName: "" }).success,
    ).toBe(false);
  });
});
