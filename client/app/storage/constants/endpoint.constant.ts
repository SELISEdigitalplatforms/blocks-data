import { API_BASES } from "@/constants/endpoint.constant";

const STORAGE_SUBPATH = "/Storage";
const FILES_SUBPATH = "/Files";

// Storage Configuration endpoints (IDP host; paths under /api/Storage)
export const STORAGE_CONFIG_ENDPOINTS = {
  get GET_CONFIGS(): string {
    return `${API_BASES.IDP}${STORAGE_SUBPATH}/Gets`;
  },
  get SAVE_CONFIG(): string {
    return `${API_BASES.IDP}${STORAGE_SUBPATH}/Save`;
  },
  get DELETE_CONFIG(): string {
    return `${API_BASES.IDP}${STORAGE_SUBPATH}/Delete`;
  },
};

// Storage File endpoints
export const STORAGE_FILE_ENDPOINTS = {
  GET_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/GetFile`,
  DELETE_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/DeleteFile`,
  DELETE_FOLDER: `${API_BASES.UDS}${FILES_SUBPATH}/DeleteFolder`,
  GET_PRESIGNED_URL: `${API_BASES.UDS}${FILES_SUBPATH}/GetPreSignedUrlForUpload`,
  GET_FILES_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/GetFilesInfo`,
  UPDATE_FILE_ADDITIONAL_INFO: `${API_BASES.UDS}${FILES_SUBPATH}/updateFileAdditionalInfo`,
  UPLOAD_TO_LOCAL_STORAGE: `${API_BASES.UDS}${FILES_SUBPATH}/UploadFileToLocalStorage`,
  GET_DMS_FILE_AND_FOLDER: `${API_BASES.UDS}${FILES_SUBPATH}/GetDmsFileAndFolder`,
  UPLOAD_DMS_FILE: `${API_BASES.UDS}${FILES_SUBPATH}/UploadFile`,
  CREATE_FOLDER: `${API_BASES.UDS}${FILES_SUBPATH}/CreateFolder`,
  UPLOAD_PUBLIC_CERTIFICATE: `${API_BASES.UDS}/Certificate/UploadCertificate`,
} as const;
