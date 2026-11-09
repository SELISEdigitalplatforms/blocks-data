import { beforeEach, describe, expect, it, vi } from "vitest";

const getRuntimeEnv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runtime-env", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/runtime-env")>()),
  getRuntimeEnv,
}));

import { isGraphQLDeprecated } from "./graphql-deprecation";

beforeEach(() => getRuntimeEnv.mockReset());

describe("isGraphQLDeprecated", () => {
  it("is true when a date is configured", () => {
    getRuntimeEnv.mockReturnValue("2026-12-01");
    expect(isGraphQLDeprecated()).toBe(true);
    expect(getRuntimeEnv).toHaveBeenCalledWith("BLOCKS_GRAPHQL_DEPRECATED_SINCE");
  });

  it("is false when the value is empty", () => {
    getRuntimeEnv.mockReturnValue("");
    expect(isGraphQLDeprecated()).toBe(false);
  });

  it("is false when the value is only whitespace", () => {
    getRuntimeEnv.mockReturnValue("   ");
    expect(isGraphQLDeprecated()).toBe(false);
  });

  it("is false for the unreplaced placeholder", () => {
    getRuntimeEnv.mockReturnValue("__BLOCKS_GRAPHQL_DEPRECATED_SINCE__");
    expect(isGraphQLDeprecated()).toBe(false);
  });
});
