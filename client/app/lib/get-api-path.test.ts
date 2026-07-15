import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: () => "https://data.api",
}));

import { getApiPath, getApiUrl } from "./get-api-path";

describe("get-api-path", () => {
  it("getApiPath always returns /api", () => {
    expect(getApiPath("anything")).toBe("/api");
  });

  it("getApiUrl builds an absolute url from the runtime base", () => {
    expect(getApiUrl("svc", "users")).toBe("https://data.api/api/users");
  });
});
