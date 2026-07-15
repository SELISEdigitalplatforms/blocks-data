import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime-env", () => ({
  getRuntimeEnv: (key: string) => `resolved:${key}`,
}));

import { resolveEnv } from "./resolve-env";

describe("resolveEnv", () => {
  beforeEach(() => {
    delete (window as unknown as { __BLOCKS_ENV__?: unknown }).__BLOCKS_ENV__;
  });
  afterEach(() => {
    delete (window as unknown as { __BLOCKS_ENV__?: unknown }).__BLOCKS_ENV__;
  });

  it("replaces __BLOCKS_...__ placeholders with resolved values", () => {
    (window as unknown as { __BLOCKS_ENV__: Record<string, string> }).__BLOCKS_ENV__ =
      {
        BLOCKS_DATA_BASE_URL: "__BLOCKS_DATA_BASE_URL__",
        ALREADY_SET: "https://real",
      };

    resolveEnv();

    const env = (window as unknown as { __BLOCKS_ENV__: Record<string, string> })
      .__BLOCKS_ENV__;
    expect(env.BLOCKS_DATA_BASE_URL).toBe("resolved:BLOCKS_DATA_BASE_URL");
    expect(env.ALREADY_SET).toBe("https://real");
  });

  it("is a no-op when window has no __BLOCKS_ENV__", () => {
    expect(() => resolveEnv()).not.toThrow();
  });
});
