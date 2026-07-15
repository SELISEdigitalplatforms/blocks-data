import { describe, expect, it, vi } from "vitest";

// blocks-kit's useScopedPath returns a builder: useScopedPath()(segment) -> path
const builder = vi.fn((segment: string) => `/scoped/${segment}`);
vi.mock("@seliseblocks/blocks-kit", () => ({
  useScopedPath: () => builder,
}));

import {
  useDataGatewayPath,
  useStoragePath,
  useDashboardPath,
} from "./use-scoped-path";

describe("use-scoped-path helpers", () => {
  it("scopes the data-gateway path", () => {
    expect(useDataGatewayPath()).toBe("/scoped/data-gateway");
    expect(builder).toHaveBeenCalledWith("data-gateway");
  });

  it("scopes the storage path", () => {
    expect(useStoragePath()).toBe("/scoped/storage");
    expect(builder).toHaveBeenCalledWith("storage");
  });

  it("scopes the dashboard path", () => {
    expect(useDashboardPath()).toBe("/scoped/dashboard");
    expect(builder).toHaveBeenCalledWith("dashboard");
  });
});
