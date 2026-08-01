import { DmsPermissionFlags, NO_PERMISSIONS } from "../models/dms.model";

/** Which actions the current user may take on one item. */
export interface ItemActions {
  canPreview: boolean;
  canDownload: boolean;
  canRename: boolean;
  canMove: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canManageAccess: boolean;
  canViewVersions: boolean;
}

/**
 * Reads the permission flags off a listing item.
 *
 * An item that arrives without flags is treated as view-only rather than fully
 * permitted. Defaulting the other way would render actions the server then
 * refuses, and would imply an access level the caller does not have.
 */
export function permissionsOf(item: { permissions?: DmsPermissionFlags | null }): DmsPermissionFlags {
  return item?.permissions ?? NO_PERMISSIONS;
}

/**
 * Maps permission flags onto the actions a menu should offer.
 *
 * The mapping is deliberately not one-to-one. Renaming, moving and copying are
 * all edits of the item or its placement, so they follow `canEdit`; copying
 * additionally needs somewhere to read from, which `canView` already implies.
 * Versions are part of reading a file's history, so they follow `canDownload`
 * rather than `canView`: seeing that older versions exist is close enough to
 * having them.
 */
export function itemActions(item: { permissions?: DmsPermissionFlags | null }): ItemActions {
  const p = permissionsOf(item);

  return {
    canPreview: p.canView,
    canDownload: p.canDownload,
    canRename: p.canEdit,
    canMove: p.canEdit,
    canCopy: p.canView,
    canDelete: p.canDelete,
    canManageAccess: p.canManage,
    canViewVersions: p.canDownload,
  };
}

/**
 * Whether the current folder allows adding content. Upload and create-folder
 * are writes into the parent, so they follow the parent's `canEdit`.
 *
 * A missing parent means the root listing, where creation is gated server-side
 * by a separate permission the client cannot see; the button is offered and the
 * server is left to refuse, rather than hiding a capability the user may hold.
 */
export function canAddToFolder(parent?: { permissions?: DmsPermissionFlags | null } | null): boolean {
  if (!parent) {
    return true;
  }

  return permissionsOf(parent).canEdit;
}

/** True when at least one action is available, so an empty menu can be hidden. */
export function hasAnyAction(actions: ItemActions): boolean {
  return Object.values(actions).some(Boolean);
}
