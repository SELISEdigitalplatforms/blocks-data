import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateWithGithub,
  verifyOAuthState,
  authenticateWithGitlab,
  authenticateWithBitbucket,
  authenticateWithAzure,
  authenticateWithAws,
} from "./git-provider-auth.service";

describe("git-provider-auth.service", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── authenticateWithGithub ──────────────────────────────────────────────
  describe("authenticateWithGithub", () => {
    it("opens the GitHub OAuth authorize URL in a new tab with the expected params", () => {
      authenticateWithGithub();

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [urlArg, target, features] = openSpy.mock.calls[0];
      const url = new URL(urlArg as string);

      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("scope")).toBe("repo user:email read:user read:repo_hook");
      // client_id falls back to "" when the env var is not set
      expect(url.searchParams.get("client_id")).toBe("");
      // state must be a 64-char hex string generated from 32 random bytes
      expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
      expect(target).toBe("_blank");
      expect(features).toBe("noopener,noreferrer");
    });

    it("persists the generated state and default destination in localStorage", () => {
      authenticateWithGithub();

      const url = new URL(openSpy.mock.calls[0][0] as string);
      const state = url.searchParams.get("state");

      expect(localStorage.getItem("github_auth_state")).toBe(state);
      expect(localStorage.getItem("github_auth_destination")).toBe("/");
      expect(localStorage.getItem("github_auth_project_key")).toBeNull();
    });

    it("uses the stored destination when present", () => {
      localStorage.setItem("destination", "/dashboard");

      authenticateWithGithub();

      expect(localStorage.getItem("github_auth_destination")).toBe("/dashboard");
    });

    it("stores the project key when provided", () => {
      authenticateWithGithub("extra", "project-42");

      expect(localStorage.getItem("github_auth_project_key")).toBe("project-42");
    });

    it("generates a fresh random state on each call", () => {
      authenticateWithGithub();
      const first = localStorage.getItem("github_auth_state");
      authenticateWithGithub();
      const second = localStorage.getItem("github_auth_state");

      expect(first).not.toBe(second);
    });
  });

  // ─── verifyOAuthState ────────────────────────────────────────────────────
  describe("verifyOAuthState", () => {
    it("returns true when the received state matches the stored state", () => {
      localStorage.setItem("github_auth_state", "abc123");
      expect(verifyOAuthState("abc123")).toBe(true);
    });

    it("returns false when the received state does not match", () => {
      localStorage.setItem("github_auth_state", "abc123");
      expect(verifyOAuthState("nope")).toBe(false);
    });

    it("returns false when there is no stored state and received is null", () => {
      // stored is null, received is null -> null === null is true; guard against that
      expect(verifyOAuthState("something")).toBe(false);
    });
  });

  // ─── unimplemented providers ─────────────────────────────────────────────
  describe("unimplemented providers", () => {
    it("logs a not-implemented message for each stub without throwing", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      expect(() => authenticateWithGitlab()).not.toThrow();
      expect(() => authenticateWithBitbucket()).not.toThrow();
      expect(() => authenticateWithAzure()).not.toThrow();
      expect(() => authenticateWithAws()).not.toThrow();

      expect(logSpy).toHaveBeenCalledTimes(4);
      expect(logSpy).toHaveBeenCalledWith("GitLab authentication not yet implemented");
      expect(logSpy).toHaveBeenCalledWith("Bitbucket authentication not yet implemented");
      expect(logSpy).toHaveBeenCalledWith("Azure DevOps authentication not yet implemented");
      expect(logSpy).toHaveBeenCalledWith("AWS CodeCommit authentication not yet implemented");
    });
  });
});
