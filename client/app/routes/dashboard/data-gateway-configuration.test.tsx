import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "https://dev-os.blocksdevelopers.com" }));

import DataGatewayConfigurationPage from "./data-gateway-configuration";

describe("old /data-gateway/configuration route", () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { value: original, configurable: true });
  });

  it("redirects to the OS data-gateway config page of the project in the URL", () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", { value: { ...original, replace }, configurable: true });

    render(
      <MemoryRouter initialEntries={["/app/p-1/data-gateway/configuration"]}>
        <Routes>
          <Route path="/app/:itemId/data-gateway/configuration" element={<DataGatewayConfigurationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(replace).toHaveBeenCalledWith(
      "https://dev-os.blocksdevelopers.com/app/p-1/secret-management/data-gateway",
    );
  });
});
