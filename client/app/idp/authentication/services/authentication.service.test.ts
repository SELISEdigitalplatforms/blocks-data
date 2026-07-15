import { describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";

// auth-config.service (imported transitively) builds URLs against the http client.
vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { authenticationService } from "./authentication.service";
import { AuthConfiguration } from "./auth-config.service";

describe("authenticationService", () => {
  it("exposes a ready-to-use AuthConfiguration instance", () => {
    expect(authenticationService.configuration).toBeInstanceOf(AuthConfiguration);
  });

  it("wires the configuration methods through", () => {
    expect(typeof authenticationService.configuration.getConfig).toBe("function");
    expect(typeof authenticationService.configuration.saveAuthConfig).toBe(
      "function",
    );
  });
});
