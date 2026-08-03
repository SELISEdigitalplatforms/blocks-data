import { describe, expect, it } from "vitest";
import { isChecked } from "./permission-selection-utils";
import type { PermissionMap, PermissionState } from "./role-details-state";

function makePerm(overrides: Partial<PermissionState>): PermissionState {
  return {
    modified: false,
    isInitiallyAssigned: false,
    changeState: null,
    parents: [],
    ...overrides,
  } as PermissionState;
}

describe("permission-selection-utils isChecked", () => {
  it("returns false when the permission is unknown", () => {
    const map: PermissionMap = new Map();
    expect(isChecked("missing", map)).toBe(false);
  });

  it("returns true for a newly added permission", () => {
    const map: PermissionMap = new Map([
      ["r", makePerm({ modified: true, changeState: "added" })],
    ]);
    expect(isChecked("r", map)).toBe(true);
  });

  it("returns false for a removed permission that was initially assigned", () => {
    const map: PermissionMap = new Map([
      [
        "r",
        makePerm({
          modified: true,
          changeState: "removed",
          isInitiallyAssigned: true,
        }),
      ],
    ]);
    expect(isChecked("r", map)).toBe(false);
  });

  it("falls back to the initial assignment when unmodified", () => {
    const assigned: PermissionMap = new Map([
      ["r", makePerm({ isInitiallyAssigned: true })],
    ]);
    expect(isChecked("r", assigned)).toBe(true);

    const unassigned: PermissionMap = new Map([
      ["r", makePerm({ isInitiallyAssigned: false })],
    ]);
    expect(isChecked("r", unassigned)).toBe(false);
  });
});
