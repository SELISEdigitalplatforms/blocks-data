import { API_BASES } from "@/constants/endpoint.constant";
import { deriveOsBaseUrl } from "@/lib/blocks-url.util";
import { getRuntimeEnv } from "@/lib/runtime-env";

const STORAGE_SUBPATH = "/Storage";
const FILES_SUBPATH = "/files";
const FOLDERS_SUBPATH = "/directory";
const OBJECT_SUBPATH = "/objects";

/** Blocks OS API base (`<os origin>/api`): `BLOCKS_OS_BASE_URL`, else derived from this host's environment. */
const resolveOsApiBase = (): string => {
  const origin = getRuntimeEnv("BLOCKS_OS_BASE_URL").trim() || deriveOsBaseUrl();
  return `${origin.endsWith("/") ? origin.slice(0, -1) : origin}/api`;
};

// Storage Configuration read endpoint. Blocks OS owns the storage configuration API (list, save, delete);
// the list returns settings and a status per secret, never a secret value.
export const STORAGE_CONFIG_ENDPOINTS = {
  get GET_CONFIGS(): string {
    return `${resolveOsApiBase()}${STORAGE_SUBPATH}/Gets`;
  },
};

// Storage File endpoints (see FileController).
export const STORAGE_FILE_ENDPOINTS = {
  GET_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/get-file`,
  DELETE_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/delete-file`,
  GET_PRESIGNED_URL: `${API_BASES.UDS}${FILES_SUBPATH}/get-pre-signed-url-for-upload`,
  COMPLETE_UPLOAD: `${API_BASES.UDS}${FILES_SUBPATH}/complete-upload`,
  GET_FILES_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/get-files-info`,
  UPDATE_FILE_ADDITIONAL_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/update-file-additional-info`,
  UPLOAD_TO_LOCAL_STORAGE: `${API_BASES.UDS}${FILES_SUBPATH}/upload-file-to-local-storage`,
  UPLOAD_PUBLIC_CERTIFICATE: `${API_BASES.UDS}/Certificate/UploadCertificate`,
} as const;

// DMS directory endpoints (see DirectoryController).
export const FOLDER_ENDPOINTS = {
  GET: `${API_BASES.UDS}${FOLDERS_SUBPATH}/get-directory`,
  CREATE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/create-directory`,
  CREATE_ROOT: `${API_BASES.UDS}${FOLDERS_SUBPATH}/create-root-directory`,
  UPDATE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/update-directory`,
  MOVE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/move-directory`,
  DELETE: `${API_BASES.UDS}${FOLDERS_SUBPATH}/delete-directory`,
} as const;

// DMS listing, sharing, access policy, search and trash endpoints (see ObjectController).
// Directory-children listing lives here too: DirectoryController.GetDirectoryChildren
// was removed and its listing folded into ObjectController.GetObjects.
export const OBJECT_ENDPOINTS = {
  CHILDREN: `${API_BASES.UDS}${OBJECT_SUBPATH}/get-objects`,
  SEARCH: `${API_BASES.UDS}${OBJECT_SUBPATH}/search-objects`,
  TRASH: `${API_BASES.UDS}${OBJECT_SUBPATH}/get-trash`,
  RESTORE: `${API_BASES.UDS}${OBJECT_SUBPATH}/restore-from-trash`,
  DELETE_PERMANENT: `${API_BASES.UDS}${OBJECT_SUBPATH}/delete-from-trash`,
  POLICIES: `${API_BASES.UDS}${OBJECT_SUBPATH}/get-access-policies`,
  GRANT: `${API_BASES.UDS}${OBJECT_SUBPATH}/grant-access`,
  UPDATE_POLICY: `${API_BASES.UDS}${OBJECT_SUBPATH}/update-access-policy`,
  REVOKE: `${API_BASES.UDS}${OBJECT_SUBPATH}/revoke-access-policy`,
  RESOLVE: `${API_BASES.UDS}${OBJECT_SUBPATH}/resolve-access`,
  INHERITANCE: `${API_BASES.UDS}${OBJECT_SUBPATH}/toggle-inheritance`,
  SHARE: `${API_BASES.UDS}${OBJECT_SUBPATH}/share-object`,
} as const;

// File endpoints added by the DMS revamp, alongside the existing ones above (see FileController).
export const DMS_FILE_ENDPOINTS = {
  FILE_VERSIONS: `${API_BASES.UDS}${FILES_SUBPATH}/get-file-versions`,
  CREATE_FILE_VERSION: `${API_BASES.UDS}${FILES_SUBPATH}/create-file-version`,
  COPY_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/copy-file`,
  MOVE_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/move-file`,
  RENAME_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/rename-file`,
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
