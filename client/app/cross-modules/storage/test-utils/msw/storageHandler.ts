import { http, HttpResponse, type JsonBodyType } from "msw";
import {
  mockStorageConfigList,
  mockGetFileByIdResponse,
  mockGetFilesInfoResponse,
  mockPreSignedUrlResponse,
  mockGetDmsFileAndFolderResponse,
  mockUploadDmsFileResponse,
  mockSuccessResponse,
  mockDeleteSuccessResponse,
} from "../__mocks__/data.mock";
import { STORAGE_CONFIG_ENDPOINTS, STORAGE_FILE_ENDPOINTS } from "../../constants/endpoint.constant";

// Endpoint patterns for MSW handlers
const GET_CONFIGS_PATTERN = new RegExp(STORAGE_CONFIG_ENDPOINTS.GET_CONFIGS);
const SAVE_CONFIG_PATTERN = new RegExp(STORAGE_CONFIG_ENDPOINTS.SAVE_CONFIG);
const DELETE_CONFIG_PATTERN = new RegExp(STORAGE_CONFIG_ENDPOINTS.DELETE_CONFIG);
const GET_FILE_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.GET_FILE);
const DELETE_FILE_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.DELETE_FILE);
const GET_PRESIGNED_URL_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.GET_PRESIGNED_URL);
const GET_FILES_INFO_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.GET_FILES_INFO);
const UPDATE_FILE_INFO_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.UPDATE_FILE_ADDITIONAL_INFO);
const UPLOAD_TO_LOCAL_STORAGE_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.UPLOAD_TO_LOCAL_STORAGE);
const GET_DMS_FILE_AND_FOLDER_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.GET_DMS_FILE_AND_FOLDER);
const UPLOAD_DMS_FILE_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.UPLOAD_DMS_FILE);
const CREATE_FOLDER_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.CREATE_FOLDER);
const UPLOAD_CERTIFICATE_PATTERN = new RegExp(STORAGE_FILE_ENDPOINTS.UPLOAD_PUBLIC_CERTIFICATE);

export const storageHandlers = [
  // Get storage configurations
  http.get(GET_CONFIGS_PATTERN, () => {
    return HttpResponse.json(mockStorageConfigList);
  }),

  // Save storage configuration
  http.post(SAVE_CONFIG_PATTERN, async () => {
    return HttpResponse.json(mockSuccessResponse);
  }),

  // Delete storage configuration
  http.post(DELETE_CONFIG_PATTERN, () => {
    return HttpResponse.json(mockDeleteSuccessResponse);
  }),

  // Get file by ID
  http.get(GET_FILE_PATTERN, () => {
    return HttpResponse.json(mockGetFileByIdResponse);
  }),

  // Delete file
  http.post(DELETE_FILE_PATTERN, async () => {
    return HttpResponse.json(mockDeleteSuccessResponse);
  }),

  // Get pre-signed URL for upload
  http.post(GET_PRESIGNED_URL_PATTERN, async () => {
    return HttpResponse.json(mockPreSignedUrlResponse);
  }),

  // Get files info
  http.post(GET_FILES_INFO_PATTERN, async () => {
    return HttpResponse.json(mockGetFilesInfoResponse);
  }),

  // Update file additional info
  http.post(UPDATE_FILE_INFO_PATTERN, async () => {
    return HttpResponse.json(mockSuccessResponse);
  }),

  // Upload file to local storage
  http.post(UPLOAD_TO_LOCAL_STORAGE_PATTERN, async () => {
    return HttpResponse.json(mockSuccessResponse);
  }),

  // Get DMS files and folders
  http.post(GET_DMS_FILE_AND_FOLDER_PATTERN, async () => {
    return HttpResponse.json(mockGetDmsFileAndFolderResponse);
  }),

  // Upload DMS file
  http.post(UPLOAD_DMS_FILE_PATTERN, async () => {
    return HttpResponse.json(mockUploadDmsFileResponse);
  }),

  // Create DMS folder
  http.post(CREATE_FOLDER_PATTERN, async () => {
    return HttpResponse.json(mockUploadDmsFileResponse);
  }),

  // Upload public certificate
  http.post(UPLOAD_CERTIFICATE_PATTERN, async () => {
    return HttpResponse.json({ downloadUrl: "https://storage.example.com/cert.pfx" });
  }),
];

// Helper functions to create common responses for server.use in component tests
export const getStorageConfigsHandler = (response: JsonBodyType) =>
  http.get(GET_CONFIGS_PATTERN, () => HttpResponse.json(response));

export const saveStorageConfigHandler = (response: JsonBodyType) =>
  http.post(SAVE_CONFIG_PATTERN, () => HttpResponse.json(response));

export const deleteStorageConfigHandler = (response: JsonBodyType) =>
  http.post(DELETE_CONFIG_PATTERN, () => HttpResponse.json(response));

export const getFileHandler = (response: JsonBodyType) =>
  http.get(GET_FILE_PATTERN, () => HttpResponse.json(response));

export const deleteFileHandler = (response: JsonBodyType) =>
  http.post(DELETE_FILE_PATTERN, () => HttpResponse.json(response));

export const getPreSignedUrlHandler = (response: JsonBodyType) =>
  http.post(GET_PRESIGNED_URL_PATTERN, () => HttpResponse.json(response));

export const getFilesInfoHandler = (response: JsonBodyType) =>
  http.post(GET_FILES_INFO_PATTERN, () => HttpResponse.json(response));

export const updateFileInfoHandler = (response: JsonBodyType) =>
  http.post(UPDATE_FILE_INFO_PATTERN, () => HttpResponse.json(response));

export const uploadToLocalStorageHandler = (response: JsonBodyType) =>
  http.post(UPLOAD_TO_LOCAL_STORAGE_PATTERN, () => HttpResponse.json(response));

export const getDmsFileAndFolderHandler = (response: JsonBodyType) =>
  http.post(GET_DMS_FILE_AND_FOLDER_PATTERN, () => HttpResponse.json(response));

export const uploadDmsFileHandler = (response: JsonBodyType) =>
  http.post(UPLOAD_DMS_FILE_PATTERN, () => HttpResponse.json(response));

export const createFolderHandler = (response: JsonBodyType) =>
  http.post(CREATE_FOLDER_PATTERN, () => HttpResponse.json(response));

export const uploadCertificateHandler = (response: JsonBodyType) =>
  http.post(UPLOAD_CERTIFICATE_PATTERN, () => HttpResponse.json(response));
