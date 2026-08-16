// Wire shapes for the DMS object endpoints. These mirror the backend contracts in
// server/Storage.DomainService/Storage/*.cs (Dms*Request/Response types); JSON is
// camelCase, so the names match apart from that.

export type DmsItemType = "directory" | "file";

export type ObjectPermission = "View" | "Download" | "Edit" | "Delete" | "Manage" | "Owner";

export type ObjectPrincipalType = "User" | "Role" | "Everyone" | "Organization";

export type ObjectEffect = "Allow" | "Deny";

/** The six operations the current user holds on one item. */
export interface DmsPermissionFlags {
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  canOwner: boolean;
}

export interface DmsItemBase {
  itemId: string;
  name: string;
  parentDirectoryId?: string;
  fullPath?: string;
  inheritsParentAccess: boolean;
  isArchived: boolean;
  isActive: boolean;
  configurationName?: string;
  createdBy?: string;
  createdDate?: string;
  lastUpdatedDate?: string;
  tags?: string[];
  /**
   * True for directories seeded from the default templates (Cloud/Construct/etc).
   * The storage page disables destructive row actions (move/rename/delete) on these.
   */
  isDefault?: boolean;
  permissions: DmsPermissionFlags;
}

export interface DmsDirectoryItem extends DmsItemBase {
  type: "directory";
  description?: string;
  moduleName?: string;
  childDirectoryCount: number;
  childFileCount: number;
  sizeInBytes: number;
  allowedFileExtensions?: string[];
}

export interface DmsFileItem extends DmsItemBase {
  type: "file";
  extension?: string;
  sizeInBytes: number;
  contentType?: string;
  currentVersion: number;
}

export type DmsItem = DmsDirectoryItem | DmsFileItem;

export interface DmsChildrenResponse {
  items: DmsItem[];
  nextCursor?: string;
  totalChildCount: number;
  hasMore: boolean;
}

export interface DmsDirectoryDetail extends DmsDirectoryItem {
  ancestorIds: string[];
}

export interface AccessPolicyDto {
  itemId: string;
  resourceId?: string;
  principalType: ObjectPrincipalType;
  principalId?: string;
  permission: ObjectPermission;
  effect: ObjectEffect;
  priority: number;
  expiresAt?: string;
  isInherited: boolean;
  grantedBy?: string;
  createdDate?: string;
}

export interface CreateDirectoryDto {
  name: string;
  parentDirectoryId?: string;
  configurationName?: string;
  description?: string;
  moduleName?: string;
  metaData?: Record<string, unknown>;
  allowedFileExtensions?: string[];
  inheritsAccess?: boolean;
  projectKey?: string;
}

export interface UpdateDirectoryDto {
  directoryId: string;
  name?: string;
  description?: string;
}

export interface MoveDirectoryDto {
  directoryId: string;
  targetDirectoryId?: string;
}

export interface DeleteDirectoryDto {
  directoryId: string;
  permanent?: boolean;
}

export interface GrantAccessDto {
  resourceId: string;
  resourceType?: "Directory" | "File";
  principalType: ObjectPrincipalType;
  principalId?: string;
  permission: ObjectPermission;
  effect: ObjectEffect;
  expiresAt?: string;
  priority?: number;
  policyItemId?: string;
}

export interface ShareObjectDto {
  resourceId: string;
  resourceType?: "Directory" | "File";
  principalType: ObjectPrincipalType;
  principalId?: string;
  permission: ObjectPermission;
  expiresAt?: string;
}

export interface FileVersionDto {
  itemId: string;
  no: number;
  sizeInBytes: number;
  uploadedBy?: string;
  createdDate?: string;
}

export interface FileVersionsResponse {
  items: FileVersionDto[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface DmsChildrenQuery {
  /**
   * The directory whose children to list. Empty/undefined lists the root, which is what the
   * storage page renders before any directory has been opened.
   */
  directoryId?: string;
  cursor?: string;
  limit?: number;
  type?: DmsItemType;
  search?: string;
}

export interface ObjectSearchQuery {
  query: string;
  directoryId?: string;
  type?: DmsItemType;
  cursor?: string;
  limit?: number;
}

export interface TrashQuery {
  type?: DmsItemType;
  cursor?: string;
  limit?: number;
}

/**
 * Default-deny flags. Used when a response predates per-item permissions, so an
 * older payload renders as read-only rather than as fully permitted.
 */
export const NO_PERMISSIONS: DmsPermissionFlags = {
  canView: true,
  canDownload: false,
  canEdit: false,
  canDelete: false,
  canManage: false,
  canOwner: false,
};

/**
 * Reads the item kind. `type` is the contract, but listings that came from the
 * legacy shape carry only `typeString`, so that is the fallback rather than an
 * assumption that everything without `type` is a file.
 */
export function resolveItemType(item: { type?: string; typeString?: string }): DmsItemType {
  const raw = (item.type ?? item.typeString ?? "").toString().toLowerCase();
  return raw === "directory" || raw === "directory" ? "directory" : "file";
}

export function isDirectory(item: DmsItem): item is DmsDirectoryItem {
  return item.type === "directory";
}
