import { afterEach, describe, expect, it } from "vitest";
import {
  deriveUtilityBaseUrl,
  deriveIdpBaseUrl,
  deriveUdsBaseUrl,
  deriveAgentBaseUrl,
  deriveOsBaseUrl,
  deriveEurolmBaseUrl,
  deriveLogicBaseUrl,
  deriveObservabilityBaseUrl,
  deriveDeploymentBaseUrl,
} from "./blocks-url.util";

/** jsdom exposes window.location; override just the origin for a test. */
function setOrigin(origin: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, origin, href: `${origin}/` },
    writable: true,
    configurable: true,
  });
}

describe("blocks-url.util", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("returns the plain subdomain URL on localhost", () => {
    setOrigin("http://localhost:4000");
    expect(deriveUtilityBaseUrl()).toBe(
      "https://utility.blocksdevelopers.com",
    );
    expect(deriveIdpBaseUrl()).toBe("https://idp.blocksdevelopers.com");
  });

  it("preserves the dev- environment prefix from the host", () => {
    setOrigin("https://dev-console.blocksdevelopers.com");
    expect(deriveIdpBaseUrl()).toBe("https://dev-idp.blocksdevelopers.com");
    expect(deriveUdsBaseUrl()).toBe("https://dev-uds.blocksdevelopers.com");
  });

  it("preserves the stg- environment prefix from the host", () => {
    setOrigin("https://stg-console.blocksdevelopers.com");
    expect(deriveOsBaseUrl()).toBe("https://stg-os.blocksdevelopers.com");
  });

  it("uses the bare subdomain for a production host without a prefix", () => {
    setOrigin("https://console.blocksdevelopers.com");
    expect(deriveAgentBaseUrl()).toBe("https://agent.blocksdevelopers.com");
  });

  it("covers all remaining subdomain helpers", () => {
    setOrigin("https://dev-console.blocksdevelopers.com");
    expect(deriveEurolmBaseUrl()).toBe(
      "https://dev-eurolm.blocksdevelopers.com",
    );
    expect(deriveLogicBaseUrl()).toBe("https://dev-logic.blocksdevelopers.com");
    expect(deriveObservabilityBaseUrl()).toBe(
      "https://dev-observability.blocksdevelopers.com",
    );
    expect(deriveDeploymentBaseUrl()).toBe(
      "https://dev-deployment.blocksdevelopers.com",
    );
  });
});
