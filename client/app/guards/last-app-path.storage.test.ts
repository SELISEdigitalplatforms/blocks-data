import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_APP_PATH_KEY,
  isWithinLoginSubtree,
  persistLastVisitedProtectedPath,
  getSafeReturnPathFromStorage,
} from "./last-app-path.storage";

describe("isWithinLoginSubtree", () => {
  it("matches /login and its subtree", () => {
    expect(isWithinLoginSubtree("/login")).toBe(true);
    expect(isWithinLoginSubtree("/login/reset")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isWithinLoginSubtree("/console")).toBe(false);
    expect(isWithinLoginSubtree("/loginx")).toBe(false);
  });
});

describe("persistLastVisitedProtectedPath", () => {
  beforeEach(() => sessionStorage.clear());

  it("persists a valid protected pathname", () => {
    persistLastVisitedProtectedPath("/console/data");
    expect(sessionStorage.getItem(LAST_APP_PATH_KEY)).toBe("/console/data");
  });

  it("does not persist login-subtree or malformed paths", () => {
    persistLastVisitedProtectedPath("/login");
    persistLastVisitedProtectedPath("//evil.com");
    persistLastVisitedProtectedPath("relative");
    expect(sessionStorage.getItem(LAST_APP_PATH_KEY)).toBeNull();
  });
});

describe("getSafeReturnPathFromStorage", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns the stored path when safe", () => {
    sessionStorage.setItem(LAST_APP_PATH_KEY, "/console/data?tab=1");
    expect(getSafeReturnPathFromStorage()).toBe("/console/data");
  });

  it("returns the fallback when nothing stored", () => {
    expect(getSafeReturnPathFromStorage()).toBe("/console");
    expect(getSafeReturnPathFromStorage("/home")).toBe("/home");
  });

  it("rejects unsafe or login stored paths", () => {
    sessionStorage.setItem(LAST_APP_PATH_KEY, "//evil.com");
    expect(getSafeReturnPathFromStorage()).toBe("/console");

    sessionStorage.setItem(LAST_APP_PATH_KEY, "/login/x");
    expect(getSafeReturnPathFromStorage()).toBe("/console");
  });
});
