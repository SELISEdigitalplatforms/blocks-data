import { describe, expect, it } from "vitest";
import {
  CreateProjectResourcesFormDefaultValue,
  CreateProjectResourcesFormSchema,
} from "./utils";

describe("CreateProjectResourcesFormDefaultValue", () => {
  it("starts with an empty assets list", () => {
    expect(CreateProjectResourcesFormDefaultValue).toEqual({ assets: [] });
  });
});

describe("CreateProjectResourcesFormSchema", () => {
  it("accepts an empty object because assets is optional", () => {
    expect(CreateProjectResourcesFormSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid asset", () => {
    const result = CreateProjectResourcesFormSchema.safeParse({
      assets: [{ id: 1, name: "repo", html_url: "https://github.com/x/repo", full_name: "x/repo" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an asset with an empty name", () => {
    const result = CreateProjectResourcesFormSchema.safeParse({
      assets: [{ name: "", html_url: "https://github.com/x/repo" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Asset name is required");
    }
  });

  it("rejects an asset with an invalid url", () => {
    const result = CreateProjectResourcesFormSchema.safeParse({
      assets: [{ name: "repo", html_url: "not-a-url" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Link must be a valid URL");
    }
  });

  it("treats id and full_name as optional", () => {
    const result = CreateProjectResourcesFormSchema.safeParse({
      assets: [{ name: "repo", html_url: "https://example.com" }],
    });
    expect(result.success).toBe(true);
  });
});
