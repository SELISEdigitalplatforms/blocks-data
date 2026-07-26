import {
  TEST_PROJECT_KEY,
  TEST_TENANT_ID,
  MOCK_NEW_ITEM_ID,
  mockDeleteSuccessResponse,
} from "@/test-utils/__mocks__";
import {
  DmsItemType,
  IDmsFileAndFolderInfo,
  IFile,
  IGetDmsFileAndFolderResponse,
  IGetFileByFileIDResponse,
  IGetFilesInfoResponse,
  IGetPreSignedUrlForUploadResponse,
  IStorageConfiguration,
  IUploadDmsFileResponse,
} from "../../models/storage.model";

export { mockDeleteSuccessResponse };

// ─── Mock IDs ─────────────────────────────────────────────────────────────────

const MOCK_STORAGE_CONFIG_ID_1 = "e5c0-5a0d-2b7f-1e48";
const MOCK_STORAGE_CONFIG_ID_2 = "f1d2-6b1e-3c8a-2f59";
const MOCK_STORAGE_CONFIG_ID_3 = "a7e4-7c2f-4d9b-3a60";
const MOCK_STORAGE_USER_ID_1 = "b3f6-8d3a-5e0c-4b71";
const MOCK_STORAGE_USER_ID_2 = "c9a8-9e4b-6f1d-5c82";
const MOCK_FILE_ID_1 = "d5b0-0f5c-7a2e-6d93";
const MOCK_FILE_ID_2 = "e1c2-1a6d-8b3f-7e04";
const MOCK_DIR_ID = "f7d4-2b7e-9c4a-8f15";
const MOCK_AGENT_ID = "a3e6-3c8f-0d5b-9a26";
const MOCK_NEW_FILE_UPLOAD_ID = "b9f8-4d9a-1e6c-0b37";
const MOCK_DMS_FILE_ID = "c5a0-5e0b-2f7d-1c48";
const MOCK_DMS_FOLDER_ID = "d1b2-6f1c-3a8e-2d59";
const MOCK_FILE_STORAGE_ID = "e7c4-7a2d-4b9f-3e60";
const MOCK_FOLDER_ID = "f3d6-8b3e-5c0a-4f71";

// ─── Storage Configurations ───────────────────────────────────────────────────

export const mockAmazonStorageConfig: IStorageConfiguration = {
  storageStrategy: "Amazon",
  accessKey: "MOCK_ACCESS_KEY",
  secretKey: "MOCK_SECRET_KEY_NOT_A_REAL_CREDENTIAL",
  cloudStorageRegionEndPoint: "us-east-1",
  connectionString: null,
  host: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
  createdBy: MOCK_STORAGE_USER_ID_1,
  createdDate: "2024-01-01T10:00:00Z",
  itemId: MOCK_STORAGE_CONFIG_ID_1,
  lastUpdatedBy: MOCK_STORAGE_USER_ID_1,
  lastUpdatedDate: "2024-01-15T14:30:00Z",
  name: "Amazon S3 Config",
  organizationIds: [TEST_TENANT_ID],
  tags: ["production"],
};

export const mockAzureStorageConfig: IStorageConfiguration = {
  storageStrategy: "Azure",
  connectionString: "DefaultEndpointsProtocol=https;AccountName=myaccount;...",
  accessKey: null,
  secretKey: null,
  cloudStorageRegionEndPoint: null,
  host: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
  createdBy: MOCK_STORAGE_USER_ID_1,
  createdDate: "2024-02-01T10:00:00Z",
  itemId: MOCK_STORAGE_CONFIG_ID_2,
  lastUpdatedBy: MOCK_STORAGE_USER_ID_1,
  lastUpdatedDate: "2024-02-10T14:30:00Z",
  name: "Azure Blob Config",
  organizationIds: [TEST_TENANT_ID],
  tags: [],
};

export const mockSftpStorageConfig: IStorageConfiguration = {
  storageStrategy: "SftpStorage",
  host: "sftp.example.com",
  port: "22",
  userName: "sftpuser",
  password: "sftppassword",
  remoteBasePath: "/uploads",
  accessKey: null,
  secretKey: null,
  cloudStorageRegionEndPoint: null,
  connectionString: null,
  createdBy: MOCK_STORAGE_USER_ID_2,
  createdDate: "2024-03-01T10:00:00Z",
  itemId: MOCK_STORAGE_CONFIG_ID_3,
  lastUpdatedBy: MOCK_STORAGE_USER_ID_2,
  lastUpdatedDate: "2024-03-05T14:30:00Z",
  name: "SFTP Config",
  organizationIds: [TEST_TENANT_ID],
  tags: [],
};

export const mockStorageConfigList: IStorageConfiguration[] = [
  mockAmazonStorageConfig,
  mockAzureStorageConfig,
  mockSftpStorageConfig,
];

// ─── Files ────────────────────────────────────────────────────────────────────

export const mockFile: IFile = {
  url: `https://storage.example.com/files/${MOCK_FILE_ID_1}`,
  tenantId: TEST_TENANT_ID,
  accessModifier: 1,
  metaData: {
    additionalProp1: { type: "string", value: "value1" },
    additionalProp2: { type: "string", value: "value2" },
    additionalProp3: { type: "string", value: "value3" },
  },
  additionalProperties: {},
  name: "test-file.pdf",
  parentDirectoryID: MOCK_DIR_ID,
  systemName: "test-file-system.pdf",
  type: 1,
  typeString: "pdf",
  currentVersion: 1,
  itemId: MOCK_FILE_ID_1,
};

export const mockFile2: IFile = {
  url: `https://storage.example.com/files/${MOCK_FILE_ID_2}`,
  tenantId: TEST_TENANT_ID,
  accessModifier: 0,
  metaData: {
    additionalProp1: { type: "string", value: "img" },
    additionalProp2: { type: "string", value: "" },
    additionalProp3: { type: "string", value: "" },
  },
  additionalProperties: { agentId: MOCK_AGENT_ID },
  name: "image.png",
  parentDirectoryID: MOCK_DIR_ID,
  systemName: "image-system.png",
  type: 2,
  typeString: "png",
  currentVersion: 2,
  itemId: MOCK_FILE_ID_2,
};

export const mockGetFileByIdResponse: IGetFileByFileIDResponse = {
  url: `https://storage.example.com/files/${MOCK_FILE_ID_1}?token=abc`,
  accessModifier: 1,
  itemId: MOCK_FILE_ID_1,
  tags: ["document"],
  metaData: {},
  name: "test-file.pdf",
  parentDirectoryID: MOCK_DIR_ID,
  systemName: "test-file-system.pdf",
  type: 1,
  typeString: "pdf",
  createDate: "2024-01-01T10:00:00Z",
  createdBy: MOCK_STORAGE_USER_ID_1,
  language: "en",
  tenantId: TEST_TENANT_ID,
  sizeInBytes: 204800,
  errors: null,
  isSuccess: true,
};

export const mockGetFilesInfoResponse: IGetFilesInfoResponse = {
  data: [mockFile, mockFile2],
  errors: null,
  totalCount: 2,
};

export const mockEmptyFilesInfoResponse: IGetFilesInfoResponse = {
  data: [],
  errors: null,
  totalCount: 0,
};

export const mockPreSignedUrlResponse: IGetPreSignedUrlForUploadResponse = {
  errors: null,
  isSuccess: true,
  fileId: MOCK_NEW_FILE_UPLOAD_ID,
  uploadUrl: `https://s3.amazonaws.com/bucket/${MOCK_NEW_FILE_UPLOAD_ID}?X-Amz-Signature=abc`,
};

// ─── DMS ──────────────────────────────────────────────────────────────────────

export const mockDmsFile: IDmsFileAndFolderInfo = {
  parentId: MOCK_FOLDER_ID,
  type: DmsItemType.File,
  name: "document.pdf",
  fileStorageId: MOCK_FILE_STORAGE_ID,
  extension: "pdf",
  sizeInBytes: "204800",
  version: 1,
  description: "A test document",
  itemId: MOCK_DMS_FILE_ID,
  lastUpdatedDate: "2024-01-15T14:30:00Z",
};

export const mockDmsFolder: IDmsFileAndFolderInfo = {
  parentId: "root",
  type: DmsItemType.Folder,
  name: "Documents",
  fileStorageId: "",
  extension: "",
  sizeInBytes: "0",
  version: 0,
  description: "Documents folder",
  itemId: MOCK_DMS_FOLDER_ID,
  lastUpdatedDate: "2024-01-01T10:00:00Z",
};

export const mockGetDmsFileAndFolderResponse: IGetDmsFileAndFolderResponse = {
  dmsFileAndFolderInfos: [mockDmsFolder, mockDmsFile],
  totalCount: 2,
};

export const mockUploadDmsFileResponse: IUploadDmsFileResponse = {
  result: [{ fileStorageId: "file-storage-new", success: true }],
  message: "Upload successful",
  httpStatusCode: 200,
};

// ─── Common Responses ─────────────────────────────────────────────────────────

export const mockSuccessResponse = {
  errors: null,
  isSuccess: true,
  itemId: MOCK_NEW_ITEM_ID,
};

export const mockErrorResponse = {
  errors: ["Something went wrong"],
  isSuccess: false,
  itemId: null,
};

// ─── Save/Delete Payloads ─────────────────────────────────────────────────────

export const mockSaveAmazonConfigPayload = {
  name: "Amazon S3 Config",
  projectKey: TEST_PROJECT_KEY,
  storageStrategy: "Amazon" as const,
  accessKey: "MOCK_ACCESS_KEY",
  secretKey: "MOCK_SECRET_KEY_NOT_A_REAL_CREDENTIAL",
  cloudStorageRegionEndPoint: "us-east-1",
  connectionString: null,
  host: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
  updateRequest: false,
  itemId: null,
};

export const mockSaveAzureConfigPayload = {
  name: "Azure Blob Config",
  projectKey: TEST_PROJECT_KEY,
  storageStrategy: "Azure" as const,
  connectionString: "DefaultEndpointsProtocol=https;AccountName=myaccount;...",
  accessKey: null,
  secretKey: null,
  cloudStorageRegionEndPoint: null,
  host: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
  updateRequest: false,
  itemId: null,
};

export const mockSaveSftpConfigPayload = {
  name: "SFTP Config",
  projectKey: TEST_PROJECT_KEY,
  storageStrategy: "SftpStorage" as const,
  host: "sftp.example.com",
  port: "22",
  userName: "sftpuser",
  password: "sftppassword",
  remoteBasePath: "/uploads",
  accessKey: null,
  secretKey: null,
  cloudStorageRegionEndPoint: null,
  connectionString: null,
  updateRequest: false,
  itemId: null,
};

export const mockSaveS3CompatibleConfigPayload = {
  name: "S3Compatible Config",
  projectKey: TEST_PROJECT_KEY,
  storageStrategy: "S3Compatible" as const,
  host: "minio.example.com",
  accessKey: "miniokey",
  secretKey: null,
  cloudStorageRegionEndPoint: null,
  connectionString: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
  updateRequest: false,
  itemId: null,
};

export const mockDeleteConfigPayload = {
  projectKey: TEST_PROJECT_KEY,
  configurationName: "Amazon S3 Config",
};

export const mockGetFilePayload = {
  itemId: MOCK_FILE_ID_1,
  projectKey: TEST_PROJECT_KEY,
  configurationName: "Amazon S3 Config",
};

export const mockGetFilesInfoPayload = {
  page: 1,
  pageSize: 10,
  sort: { property: "name", isDescending: false },
  projectKey: TEST_PROJECT_KEY,
};

export const mockDeleteFilePayload = {
  fileId: MOCK_FILE_ID_1,
  configurationName: "Amazon S3 Config",
  projectKey: TEST_PROJECT_KEY,
};

export const mockPreSignedUrlPayload = {
  name: "upload.pdf",
  configurationName: "Amazon S3 Config",
  projectKey: TEST_PROJECT_KEY,
  metaData: "{}",
  parentDirectoryId: MOCK_DIR_ID,
  tags: "",
  accessModifier: "public",
  moduleName: 1,
};

export const mockGetDmsPayload = {
  configurationName: "Amazon S3 Config",
  projectKey: TEST_PROJECT_KEY,
  skip: 0,
  take: 20,
};

export const mockUploadDmsFilePayload = {
  upload: [
    {
      artifactName: "document.pdf",
      description: "A test document",
      parentId: MOCK_FOLDER_ID,
      tags: [],
      metaData: {},
      organizationId: TEST_TENANT_ID,
      fileStorageId: MOCK_FILE_STORAGE_ID,
      configurationName: "Amazon S3 Config",
    },
  ],
  projectKey: TEST_PROJECT_KEY,
};

export const mockCreateDmsFolderPayload = {
  artifactName: "New Folder",
  description: "A new folder",
  parentId: "root",
  tags: [],
  metaData: {},
  organizationId: TEST_TENANT_ID,
  fileStorageId: "",
  projectKey: TEST_PROJECT_KEY,
  configurationName: "Amazon S3 Config",
};
