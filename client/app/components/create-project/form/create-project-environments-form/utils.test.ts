import { describe, expect, it } from "vitest";
import {
  createProjectEnvironmentFormDefaultValue,
  createProjectEnvironmentFormSchema,
  environmentOptions,
} from "./utils";

describe("createProjectEnvironmentFormDefaultValue", () => {
  it("starts with an empty environments list", () => {
    expect(createProjectEnvironmentFormDefaultValue).toEqual({ environments: [] });
  });
});

describe("createProjectEnvironmentFormSchema", () => {
  it("rejects an empty environments list", () => {
    const result = createProjectEnvironmentFormSchema.safeParse({ environments: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("At least one environment is required");
    }
  });

  it("accepts at least one environment", () => {
    const result = createProjectEnvironmentFormSchema.safeParse({
      environments: [{ value: "dev" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an environment entry missing its value", () => {
    const result = createProjectEnvironmentFormSchema.safeParse({
      environments: [{}],
    });
    expect(result.success).toBe(false);
  });
});

describe("environmentOptions", () => {
  it("exposes eight environments with sequential indexes", () => {
    expect(environmentOptions).toHaveLength(8);
    environmentOptions.forEach((opt, i) => {
      expect(opt.index).toBe(i);
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.subtext).toBeTruthy();
    });
  });

  it("includes the production environment", () => {
    const prod = environmentOptions.find((opt) => opt.value === "prod");
    expect(prod?.label).toBe("Production");
  });

  it("has unique values", () => {
    const values = environmentOptions.map((opt) => opt.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
