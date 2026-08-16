import { describe, expect, it } from "vitest";
import { DmsPermissionFlags } from "../models/dms.model";
import { canAddToDirectory, hasAnyAction, itemActions, permissionsOf } from "./permission-actions";

const flags = (over: Partial<DmsPermissionFlags> = {}): DmsPermissionFlags => ({
  canView: false,
  canDownload: false,
  canEdit: false,
  canDelete: false,
  canManage: false,
  canOwner: false,
  ...over,
});

describe("permissionsOf", () => {
  it("returns the flags the server sent", () => {
    expect(permissionsOf({ permissions: flags({ canEdit: true }) }).canEdit).toBe(true);
  });

  it("falls back to view-only when an item carries no flags", () => {
    // Defaulting the other way would render actions the server then refuses, and
    // would imply an access level the caller does not hold.
    const p = permissionsOf({});

    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(false);
    expect(p.canDelete).toBe(false);
    expect(p.canManage).toBe(false);
  });

  it("treats null flags the same as missing ones", () => {
    expect(permissionsOf({ permissions: null }).canEdit).toBe(false);
  });
});

describe("itemActions", () => {
  it("offers nothing but preview on a view-only item", () => {
    const actions = itemActions({ permissions: flags({ canView: true }) });

    expect(actions.canPreview).toBe(true);
    expect(actions.canDownload).toBe(false);
    expect(actions.canRename).toBe(false);
    expect(actions.canDelete).toBe(false);
    expect(actions.canManageAccess).toBe(false);
  });

  it("ties rename and move to edit", () => {
    const actions = itemActions({ permissions: flags({ canEdit: true }) });

    expect(actions.canRename).toBe(true);
    expect(actions.canMove).toBe(true);
  });

  it("ties versions to download rather than view", () => {
    // Knowing which versions exist is close enough to being able to fetch them,
    // so the history follows download.
    const viewer = itemActions({ permissions: flags({ canView: true }) });
    const downloader = itemActions({ permissions: flags({ canView: true, canDownload: true }) });

    expect(viewer.canViewVersions).toBe(false);
    expect(downloader.canViewVersions).toBe(true);
  });

  it("shows manage-access only with manage", () => {
    expect(itemActions({ permissions: flags({ canDelete: true }) }).canManageAccess).toBe(false);
    expect(itemActions({ permissions: flags({ canManage: true }) }).canManageAccess).toBe(true);
  });

  it("does not infer delete from edit", () => {
    // The server treats these as separate tiers, so the menu must not imply
    // that being able to rename means being able to remove.
    expect(itemActions({ permissions: flags({ canEdit: true }) }).canDelete).toBe(false);
  });

  it("offers everything to an owner", () => {
    const actions = itemActions({
      permissions: flags({
        canView: true,
        canDownload: true,
        canEdit: true,
        canDelete: true,
        canManage: true,
        canOwner: true,
      }),
    });

    expect(Object.values(actions).every(Boolean)).toBe(true);
  });

  it("offers nothing on an item with no flags at all beyond preview", () => {
    const actions = itemActions({});

    expect(actions.canPreview).toBe(true);
    expect(actions.canDownload).toBe(false);
  });
});

describe("canAddToDirectory", () => {
  it("allows adding when the parent is editable", () => {
    expect(canAddToDirectory({ permissions: flags({ canEdit: true }) })).toBe(true);
  });

  it("refuses when the parent is not editable", () => {
    expect(canAddToDirectory({ permissions: flags({ canView: true }) })).toBe(false);
  });

  it("allows at the root, where the server holds the real gate", () => {
    // Root creation is a separate server permission the client cannot see, so
    // the button is offered and the server is left to refuse rather than hiding
    // a capability the user may actually hold.
    expect(canAddToDirectory(undefined)).toBe(true);
    expect(canAddToDirectory(null)).toBe(true);
  });
});

describe("hasAnyAction", () => {
  it("is false when every action is denied", () => {
    expect(hasAnyAction(itemActions({ permissions: flags() }))).toBe(false);
  });

  it("is true as soon as one is allowed", () => {
    expect(hasAnyAction(itemActions({ permissions: flags({ canView: true }) }))).toBe(true);
  });
});
