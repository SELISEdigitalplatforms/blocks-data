import { describe, expect, it } from "vitest";
import { addServiceSchema, addServiceDefaultValues } from "./utils";

describe("addServiceSchema", () => {
  it("has frontend defaults", () => {
    expect(addServiceDefaultValues).toEqual({
      serviceName: "",
      tags: [],
      description: "",
      serviceType: "frontend",
    });
  });

  it("accepts a valid service", () => {
    expect(
      addServiceSchema.safeParse({
        serviceName: "Auth API",
        tags: ["a", "b"],
        serviceType: "backend",
      }).success,
    ).toBe(true);
  });

  it("requires a service name", () => {
    expect(
      addServiceSchema.safeParse({ serviceName: "", tags: [] }).success,
    ).toBe(false);
  });

  it("rejects duplicate tags", () => {
    expect(
      addServiceSchema.safeParse({
        serviceName: "svc",
        tags: ["x", "x"],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid service type", () => {
    expect(
      addServiceSchema.safeParse({
        serviceName: "svc",
        tags: [],
        serviceType: "mobile",
      }).success,
    ).toBe(false);
  });
});
