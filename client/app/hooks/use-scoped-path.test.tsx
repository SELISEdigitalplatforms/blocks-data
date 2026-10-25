import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

// blocks-kit's useScopedPath returns a builder: useScopedPath()(segment) -> path
const builder = vi.fn((segment: string) => `/scoped/${segment}`);
vi.mock("@seliseblocks/genesis-os", () => ({
  useScopedPath: () => builder,
}));

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "https://os.test" }));

import {
  buildOsSecretManagementUrl,
  useOsSecretManagementUrl,
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

describe("OS config page URL", () => {
  it("builds the exact project-scoped URL", () => {
    expect(
      buildOsSecretManagementUrl(
        "https://dev-os.blocksdevelopers.com",
        "b1aef56e-6fa1-4cf4-97b3-70d9dc97ca44",
        "data-gateway",
      ),
    ).toBe(
      "https://dev-os.blocksdevelopers.com/app/b1aef56e-6fa1-4cf4-97b3-70d9dc97ca44/secret-management/data-gateway",
    );
    expect(
      buildOsSecretManagementUrl(
        "https://dev-os.blocksdevelopers.com/",
        "b1aef56e-6fa1-4cf4-97b3-70d9dc97ca44",
        "storage",
      ),
    ).toBe(
      "https://dev-os.blocksdevelopers.com/app/b1aef56e-6fa1-4cf4-97b3-70d9dc97ca44/secret-management/storage",
    );
  });

  it("drops the project segment when there is no project id", () => {
    expect(buildOsSecretManagementUrl("https://os.example", undefined, "storage")).toBe(
      "https://os.example/app/secret-management/storage",
    );
  });

  it("the hook reads the project id from the route and the base from the env", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/app/p-1/data-gateway"]}>
        <Routes>
          <Route path="/app/:itemId/*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
    const { result } = renderHook(() => useOsSecretManagementUrl("data-gateway"), { wrapper });
    expect(result.current).toBe("https://os.test/app/p-1/secret-management/data-gateway");
  });
});
