import { describe, expect, it } from "vitest";
import {
  createClientSchema,
  CreateClientModalFormDefaultValues,
} from "./utils";

const base = {
  clientNameService: "My Service",
  audienceUrlService: "https://api.example.com",
  roles: ["admin"],
};

describe("create-client-credential schema", () => {
  it("exposes empty default values", () => {
    expect(CreateClientModalFormDefaultValues).toEqual({
      clientNameService: "",
      audienceUrlService: "",
      roles: [],
    });
  });

  it("accepts a valid client", () => {
    expect(createClientSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an empty roles array", () => {
    expect(
      createClientSchema.safeParse({ ...base, roles: [] }).success,
    ).toBe(true);
  });

  it("requires a client name", () => {
    const result = createClientSchema.safeParse({
      ...base,
      clientNameService: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Client name is required");
    }
  });

  it("rejects an invalid audience URL", () => {
    expect(
      createClientSchema.safeParse({
        ...base,
        audienceUrlService: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("rejects non-string role entries", () => {
    expect(
      createClientSchema.safeParse({ ...base, roles: [123 as never] }).success,
    ).toBe(false);
  });
});
