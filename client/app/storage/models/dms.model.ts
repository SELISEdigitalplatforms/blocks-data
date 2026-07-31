// Wire shapes for the DMS content endpoints. These mirror the backend contracts in
// server/Storage.DomainService/Storage/DmsContent{Requests,Responses}.cs; JSON is
// camelCase, so the names match apart from that.

export type DmsItemType = "folder" | "file";

export type ContentPermission = "View" | "Download" | "Edit" | "Delete" | "Manage" | "Owner";

export type ContentPrincipalType = "User" | "Role" | "Everyone" | "Organization";

export type ContentEffect = "Allow" | "Deny";

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
  permissions: DmsPermissionFlags;
}

export interface DmsFolderItem extends DmsItemBase {
  type: "folder";
  description?: string;
  moduleName?: string;
  childFolderCount: number;
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

export type DmsItem = DmsFolderItem | DmsFileItem;

export interface DmsChildrenResponse {
  items: DmsItem[];
  nextCursor?: string;
  totalChildCount: number;
  hasMore: boolean;
}

export interface DmsFolderDetail extends DmsFolderItem {
  ancestorIds: string[];
}

export interface AccessPolicyDto {
  itemId: string;
  resourceId?: string;
  principalType: ContentPrincipalType;
  principalId?: string;
  permission: ContentPermission;
  effect: ContentEffect;
  priority: number;
  expiresAt?: string;
  isInherited: boolean;
  grantedBy?: string;
  createdDate?: string;
}

export interface CreateFolderDto {
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

export interface UpdateFolderDto {
  folderId: string;
  name?: string;
  description?: string;
}

export interface MoveFolderDto {
  folderId: string;
  targetFolderId?: string;
}

export interface DeleteFolderDto {
  folderId: string;
  permanent?: boolean;
}

export interface GrantAccessDto {
  resourceId: string;
  resourceType?: "Folder" | "File";
  principalType: ContentPrincipalType;
  principalId?: string;
  permission: ContentPermission;
  effect: ContentEffect;
  expiresAt?: string;
  priority?: number;
  policyItemId?: string;
}

export interface ShareContentDto {
  resourceId: string;
  resourceType?: "Folder" | "File";
  principalType: ContentPrincipalType;
  principalId?: string;
  permission: ContentPermission;
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
  folderId: string;
  cursor?: string;
  limit?: number;
  type?: DmsItemType;
  search?: string;
}

export interface ContentSearchQuery {
  query: string;
  folderId?: string;
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
  return raw === "folder" || raw === "directory" ? "folder" : "file";
}

export function isFolder(item: DmsItem): item is DmsFolderItem {
  return item.type === "folder";
}
