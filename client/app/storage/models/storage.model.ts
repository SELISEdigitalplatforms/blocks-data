// "Azure"
export type StorageStrategyType =
  | "Amazon"
  | "Azure"
  | "SftpStorage"
  | "S3Compatible"
  | "AWS";

export interface StorageStrategyOption {
  id: string;
  label: string;
  value: StorageStrategyType;
}

export const STORAGE_STRATEGIES: StorageStrategyOption[] = [
  { id: "aws", label: "AWS", value: "Amazon" },
  { id: "azure", label: "Azure", value: "Azure" },
  { id: "sftp", label: "SFTP", value: "SftpStorage" },
  { id: "s3compatible", label: "AWS S3 Compatible", value: "S3Compatible" },
];
export interface IStorageConfiguration {
  storageStrategy: StorageStrategyType;
  accessKey: string | null;
  cloudStorageRegionEndPoint: string | null;
  connectionString: string | null;
  createdBy: string;
  createdDate: string;
  itemId: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
  name: string;
  organizationIds: string[];
  secretKey: string | null;
  tags: string[];
  host: string | null;
  port: string | null;
  userName: string | null;
  password: string | null;
  remoteBasePath: string | null;
  /**
   * Phase 1 upload-security fields. Optional because a configuration predating Phase 1, or one
   * that never set these, omits them - callers must fall back to the same documented defaults
   * the backend itself uses when they are absent.
   */
  uploadUrlExpirySeconds?: number;
  downloadUrlExpirySeconds?: number;
  maxFileSizeInBytes?: number;
  uploadCompletionRequiredFor?: ("Public" | "Private")[];
}

export interface IStorageConfigurationSavePayload {
  name: string;
  projectKey: string;
  storageStrategy: StorageStrategyType;
  secretKey: string | null;
  accessKey: string | null;
  cloudStorageRegionEndPoint: string | null;
  connectionString: string | null;
  updateRequest: boolean;
  itemId: string | null;
  host: string | null;
  port: string | null;
  userName: string | null;
  password: string | null;
  remoteBasePath: string | null;
  uploadUrlExpirySeconds: number;
  downloadUrlExpirySeconds: number;
  maxFileSizeInBytes: number;
  uploadCompletionRequiredFor: ("Public" | "Private")[];
}
export interface IStorageConfigurationDeletePayload {
  projectKey: string;
  configurationName: string;
}

/** Mirrors `Storage.DomainService.Enums.FileVerificationStatus` server-side. */
export type FileVerificationStatus = "Unverified" | "Quarantined" | "Verified" | "Rejected";

export interface IGetPreSignedUrlForUploadPayload {
  itemId?: string;
  name: string;
  configurationName: string;
  projectKey: string;
  metaData: string;
  parentDirectoryId: string;
  tags: string;
  /** "Public" or "Private" only - the storage UI never offers "Secure"/"Any" here. */
  accessModifier: string;
  /** "Creator" or "Organization". Omitted preserves the pre-existing (allow-all) default. */
  objectAccessLevel?: string;
  agentId?: string;
  additionalProperties?: Record<string, unknown>;
  moduleName: number;
  /** Declared size in bytes, used server-side to reject an oversized upload before issuing a URL. */
  sizeInBytes?: number;
  /** Declared MIME type of the file being uploaded. */
  contentType?: string;
  /** Declared checksum, verified during completion when the provider can validate it or by streaming the candidate. Omit to skip checksum verification. */
  checksum?: string;
  /** Algorithm that produced `checksum` (e.g. "SHA256", "MD5"). */
  checksumAlgorithm?: string;
}

export interface IGetPreSignedUrlForUploadResponse {
  errors: unknown;
  isSuccess: boolean;
  fileId: string;
  uploadUrl: string;
  /** Identifies the exact version this upload created; required to call `completeUpload` when completion is required. */
  fileVersionId?: string;
  uploadSessionId?: string;
  uploadUrlExpiresAtUtc?: string | null;
  /** Headers the client must send with the provider PUT (e.g. Azure's blob-type header). */
  requiredHeaders?: Record<string, string> | null;
  /** True when the client must call `completeUpload` after the provider PUT succeeds. */
  uploadCompletionRequired?: boolean;
  verificationStatus?: FileVerificationStatus;
}

export interface ICompleteUploadPayload {
  fileId: string;
  fileVersionId: string;
}

export interface ICompleteUploadResponse {
  errors: unknown;
  isSuccess: boolean;
  fileId: string;
  fileVersionId: string;
  verificationStatus: FileVerificationStatus;
  /** Safe, non-sensitive explanation set only when `verificationStatus` is "Rejected". */
  rejectionReason?: string | null;
}

export interface IGetFileByFileIDPayload {
  itemId: string;
  projectKey: string;
  configurationName?: string;
}

export interface IGetFileByFileIDResponse {
  url: string;
  accessModifier: number;
  itemId: string;
  tags: string[];
  metaData: Record<string, unknown>;
  name: string;
  parentDirectoryID: string;
  systemName: string;
  type: number;
  typeString: string;
  createDate: string;
  createdBy: string;
  language: string;
  tenantId: string;
  sizeInBytes: number;
  /** The default access this file grants when unshared: "Creator", "Organization", or unset. */
  objectAccessLevel?: string;
  /** When `url` is a provider-signed URL, when it stops working. Null for an intentionally anonymous (never-expiring) Public URL. */
  downloadUrlExpiresAtUtc?: string | null;
  errors: unknown;
  isSuccess: boolean;
}
export interface IUploadImagePayload {
  url: string;
  file: File | Blob;
  /** Provider-required headers for this upload (from `IGetPreSignedUrlForUploadResponse.requiredHeaders`). */
  headers?: Record<string, string> | null;
}

export interface IPublicCertificatePayload {
  TenantId: string;
  file: File;
}

export interface IUploadFileToLocalStorage {
  ItemId: string;
  File: File;
  MetaData: string;
  Name: string;
  ParentDirectoryId: string;
  Tags: string[];
  AccessModifier: string;
  ConfigurationName: string;
  ProjectKey: string;
}

export interface IDeleteResourceBasePayload {
  projectKey: string;
  configurationName?: string;
}

export interface IDeleteFilePayload extends IDeleteResourceBasePayload {
  fileId: string;
}

export interface IDeleteDirectoryPayload extends IDeleteResourceBasePayload {
  directoryId: string;
}
export interface IDeleteResourceResponse {
  errors: unknown;
  isSuccess: boolean;
}

export interface IGetFilesInfoPayload {
  page: number;
  pageSize: number;
  sort: {
    property: string;
    isDescending: boolean;
  };
  filter?: {
    name?: string;
    additionalProperties?: {
      agentId?: string;
      agentStatus?: string;
    };
  };
  projectKey: string;
}

export type IFile = {
  url: string;
  tenantId: string;
  accessModifier: number;
  metaData: {
    additionalProp1: {
      type: string;
      value: string;
    };
    additionalProp2: {
      type: string;
      value: string;
    };
    additionalProp3: {
      type: string;
      value: string;
    };
  };
  additionalProperties: Record<string, unknown>;
  name: string;
  parentDirectoryID: string;
  systemName: string;
  type: number;
  typeString: string;
  currentVersion: number;
  itemId: string;
};

export interface IGetFilesInfoResponse {
  data: IFile[];
  errors: unknown;
  totalCount: number;
  //  itemId: string;
}

export interface IUpdateFileAdditionalInfoPayload {
  itemId: string;
  additionalProperties: Record<string, unknown>;
  projectKey: string;
  /** "Creator" or "Organization"; empty string clears it back to the legacy default. */
  objectAccessLevel?: string;
  /** Set to true to change objectAccessLevel with this request, including clearing it. */
  updateObjectAccessLevel?: boolean;
}

export interface IUpdateFileAdditionalInfoResponse {
  data?: IFile[];

  errors: unknown;
  isSuccess: boolean;
}

export interface IGetDmsFileAndDirectoryPayload {
  parentId?: string;
  configurationName: string;
  projectKey: string;
  searchKey?: string;
  moduleName?: string;
  skip: number;
  take: number;
}

export enum DmsItemType {
  File = 1,
  Directory = 2,
}

export interface IDmsFileAndDirectoryInfo {
  parentId: string;
  type: DmsItemType;
  name: string;
  fileStorageId: string;
  extension: string;
  sizeInBytes: string;
  version: number;
  description: string;
  itemId: string;
  lastUpdatedDate: string;
}

export interface IGetDmsFileAndDirectoryResponse {
  dmsFileAndDirectoryInfos: IDmsFileAndDirectoryInfo[];
  totalCount: number;
}

export interface IDmsMetaDataValue {
  type: string;
  value: string;
}

export interface ICreateDmsDirectoryPayload {
  artifactName: string;
  description: string;
  parentId: string;
  tags: string[];
  metaData: {
    additionalProp1?: IDmsMetaDataValue;
    additionalProp2?: IDmsMetaDataValue;
    additionalProp3?: IDmsMetaDataValue;
    [key: string]: IDmsMetaDataValue | undefined;
  };
  organizationId: string;
  fileStorageId: string;
  projectKey: string;
  configurationName: string;
}
