import { API_BASES } from "@/constants/endpoint.constant";

const STORAGE_SUBPATH = "/Storage";
const FILES_SUBPATH = "/Files";
const FOLDERS_SUBPATH = "/Directory";
const CONTENT_SUBPATH = "/Content";

// Storage Configuration endpoints (IDP host; paths under /api/Storage)
export const STORAGE_CONFIG_ENDPOINTS = {
  get GET_CONFIGS(): string {
    return `${API_BASES.LOGIC}${STORAGE_SUBPATH}/Gets`;
  },
  get SAVE_CONFIG(): string {
    return `${API_BASES.LOGIC}${STORAGE_SUBPATH}/Save`;
  },
  get DELETE_CONFIG(): string {
    return `${API_BASES.LOGIC}${STORAGE_SUBPATH}/Delete`;
  },
};

// Storage File endpoints
export const STORAGE_FILE_ENDPOINTS = {
  GET_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/GetFile`,
  DELETE_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/DeleteFile`,
  GET_PRESIGNED_URL: `${API_BASES.UDS}${FILES_SUBPATH}/GetPreSignedUrlForUpload`,
  GET_FILES_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/GetFilesInfo`,
  UPDATE_FILE_ADDITIONAL_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/UpdateFileAdditionalInfo`,
  UPLOAD_TO_LOCAL_STORAGE: `${API_BASES.UDS}${FILES_SUBPATH}/UploadFileToLocalStorage`,
  UPLOAD_PUBLIC_CERTIFICATE: `${API_BASES.UDS}/Certificate/UploadCertificate`,
} as const;

// DMS directory endpoints (see DirectoryController).
export const FOLDER_ENDPOINTS = {
  GET: `${API_BASES.UDS}${FOLDERS_SUBPATH}/GetDirectory`,
  CHILDREN: `${API_BASES.UDS}${FOLDERS_SUBPATH}/GetDirectoryChildren`,
  CREATE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/CreateDirectory`,
  CREATE_ROOT: `${API_BASES.UDS}${FOLDERS_SUBPATH}/CreateRootDirectory`,
  UPDATE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/UpdateDirectory`,
  MOVE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/MoveDirectory`,
  DELETE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/DeleteDirectory`,
} as const;

// DMS sharing, access policy, search and trash endpoints (see ContentController).
export const CONTENT_ENDPOINTS = {
  SEARCH: `${API_BASES.UDS}${CONTENT_SUBPATH}/SearchContent`,
  TRASH: `${API_BASES.UDS}${CONTENT_SUBPATH}/GetTrash`,
  RESTORE: `${API_BASES.UDS}${CONTENT_SUBPATH}/RestoreFromTrash`,
  DELETE_PERMANENT: `${API_BASES.UDS}${CONTENT_SUBPATH}/DeleteFromTrash`,
  POLICIES: `${API_BASES.UDS}${CONTENT_SUBPATH}/GetAccessPolicies`,
  GRANT: `${API_BASES.UDS}${CONTENT_SUBPATH}/GrantAccess`,
  UPDATE_POLICY: `${API_BASES.UDS}${CONTENT_SUBPATH}/UpdateAccessPolicy`,
  REVOKE: `${API_BASES.UDS}${CONTENT_SUBPATH}/RevokeAccessPolicy`,
  RESOLVE: `${API_BASES.UDS}${CONTENT_SUBPATH}/ResolveAccess`,
  INHERITANCE: `${API_BASES.UDS}${CONTENT_SUBPATH}/ToggleInheritance`,
  SHARE: `${API_BASES.UDS}${CONTENT_SUBPATH}/ShareContent`,
} as const;

// File endpoints added by the DMS revamp, alongside the existing ones above.
export const DMS_FILE_ENDPOINTS = {
  FILE_VERSIONS: `${API_BASES.UDS}${FILES_SUBPATH}/GetFileVersions`,
  CREATE_FILE_VERSION: `${API_BASES.UDS}${FILES_SUBPATH}/CreateFileVersion`,
  COPY_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/CopyFile`,
  MOVE_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/MoveFile`,
} as const;

// IAM principal pickers — used to populate the manage-access dialog so the user
// picks real users / roles / organizations instead of typing an opaque id. These
// hit the IAM service via the dedicated `idpService` HttpClient, whose baseURL
// is already the IAM origin — so the paths here are RELATIVE (the HttpClient
// prepends its baseURL; using `API_BASES.IDP` would double the origin).
const IAM_SUBPATH = "/api/iam";
export const IAM_ENDPOINTS = {
  // POST with a GetUsersRequest JSON body → { data: IamUser[], totalCount }.
  USERS: `${IAM_SUBPATH}/users`,
  // POST with a GetRolesRequest JSON body → { data: IamRole[], totalCount }.
  ROLES: `${IAM_SUBPATH}/roles`,
  // GET with query params (PascalCase) → { organizations, totalCount, isSuccess }.
  ORGANIZATIONS: `${IAM_SUBPATH}/organizations`,
} as const;
