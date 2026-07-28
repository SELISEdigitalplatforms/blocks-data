import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeEnv } from "./runtime-env";

type BlocksWindow = Window & {
  __BLOCKS_ENV__?: Partial<Record<string, string>>;
};

const win = window as BlocksWindow;

describe("getRuntimeEnv", () => {
  const originalLocation = Object.getOwnPropertyDescriptor(window, "location");

  beforeEach(() => {
    delete win.__BLOCKS_ENV__;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    delete win.__BLOCKS_ENV__;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (originalLocation) {
      Object.defineProperty(window, "location", originalLocation);
    }
  });

  const setHostname = (hostname: string) => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hostname },
    });
  };

  it("prefers a valid value injected on window.__BLOCKS_ENV__", () => {
    win.__BLOCKS_ENV__ = { BLOCKS_IAM_BASE_URL: "https://iam.runtime.example.com" };
    expect(getRuntimeEnv("BLOCKS_IAM_BASE_URL")).toBe(
      "https://iam.runtime.example.com",
    );
  });

  it("ignores an unreplaced placeholder and falls back to build-time env", () => {
    win.__BLOCKS_ENV__ = { BLOCKS_IAM_BASE_URL: "__BLOCKS_IAM_BASE_URL__" };
    vi.stubEnv("BLOCKS_IAM_BASE_URL", "https://iam.build.example.com");
    expect(getRuntimeEnv("BLOCKS_IAM_BASE_URL")).toBe(
      "https://iam.build.example.com",
    );
  });

  it("falls back to build-time env when window has no runtime value", () => {
    vi.stubEnv("BLOCKS_DATA_BASE_URL", "https://data.build.example.com");
    expect(getRuntimeEnv("BLOCKS_DATA_BASE_URL")).toBe(
      "https://data.build.example.com",
    );
  });

  it("returns an empty string when the key is absent everywhere", () => {
    vi.stubEnv("BLOCKS_MONITOR_BASE_URL", "");
    expect(getRuntimeEnv("BLOCKS_MONITOR_BASE_URL")).toBe("");
  });

  it("ensures a trailing slash only when requested and missing", () => {
    win.__BLOCKS_ENV__ = { BLOCKS_LOGIC_BASE_URL: "https://logic.example.com" };
    expect(getRuntimeEnv("BLOCKS_LOGIC_BASE_URL", { ensureTrailingSlash: true })).toBe(
      "https://logic.example.com/",
    );

    win.__BLOCKS_ENV__ = { BLOCKS_LOGIC_BASE_URL: "https://logic.example.com/" };
    expect(getRuntimeEnv("BLOCKS_LOGIC_BASE_URL", { ensureTrailingSlash: true })).toBe(
      "https://logic.example.com/",
    );
  });

  it("does not append a trailing slash to an empty value", () => {
    vi.stubEnv("BLOCKS_LOGIC_BASE_URL", "");
    expect(getRuntimeEnv("BLOCKS_LOGIC_BASE_URL", { ensureTrailingSlash: true })).toBe(
      "",
    );
  });

  it("keeps the port when running against a local host", () => {
    setHostname("localhost");
    win.__BLOCKS_ENV__ = { BLOCKS_OS_BASE_URL: "https://os.example.com:8443/" };
    expect(getRuntimeEnv("BLOCKS_OS_BASE_URL", { stripPort: true })).toBe(
      "https://os.example.com:8443/",
    );
  });

  it("strips the port for non-local hosts when requested", () => {
    vi.stubEnv("DEV", false);
    setHostname("prod.example.com");
    win.__BLOCKS_ENV__ = { BLOCKS_OS_BASE_URL: "https://os.example.com:8443/" };
    expect(getRuntimeEnv("BLOCKS_OS_BASE_URL", { stripPort: true })).toBe(
      "https://os.example.com/",
    );
  });

  it("returns the original value and warns when the URL cannot be parsed", () => {
    vi.stubEnv("DEV", false);
    setHostname("prod.example.com");
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    win.__BLOCKS_ENV__ = { BLOCKS_OS_BASE_URL: "not-a-valid-url" };
    expect(getRuntimeEnv("BLOCKS_OS_BASE_URL", { stripPort: true })).toBe(
      "not-a-valid-url",
    );
    expect(warn).toHaveBeenCalled();
  });
});
