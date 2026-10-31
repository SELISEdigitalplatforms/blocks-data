import { http } from "@/lib/http-client";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  ICompleteUploadPayload,
  ICompleteUploadResponse,
  IDeleteFilePayload,
  IDeleteResourceResponse,
  IGetFileByFileIDPayload,
  IGetFileByFileIDResponse,
  IGetFilesInfoPayload,
  IGetFilesInfoResponse,
  IGetPreSignedUrlForUploadPayload,
  IGetPreSignedUrlForUploadResponse,
  IUpdateFileAdditionalInfoPayload,
  IUpdateFileAdditionalInfoResponse,
} from "../models/storage.model";
import {
  IPrepareZipDownloadPayload,
  IPrepareZipDownloadResponse,
} from "../models/zip-download.model";
import { STORAGE_FILE_ENDPOINTS, ZIP_DOWNLOAD_ENDPOINTS } from "../constants/endpoint.constant";

/** URL the browser's download manager hits to stream a prepared zip (anonymous; the ticket is the credential). */
export const buildZipDownloadUrl = (ticket: string, tenantId: string): string =>
  `${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}${ZIP_DOWNLOAD_ENDPOINTS.DOWNLOAD}` +
  `?ticket=${encodeURIComponent(ticket)}&x-blocks-key=${encodeURIComponent(tenantId)}`;

export class StorageFile {
  getFileByFileId(payload: IGetFileByFileIDPayload): Promise<IGetFileByFileIDResponse> {
    return http.get(
      `${STORAGE_FILE_ENDPOINTS.GET_FILE}?FileId=${payload.itemId}&ProjectKey=${payload.projectKey}&ConfigurationName=${payload.configurationName ?? ""}`,
    );
  }

  deleteFileByFileId(payload: IDeleteFilePayload): Promise<IDeleteResourceResponse> {
    return http.post(STORAGE_FILE_ENDPOINTS.DELETE_FILE, payload);
  }

  getPreSignedUrlForUpload(
    payload: IGetPreSignedUrlForUploadPayload,
  ): Promise<IGetPreSignedUrlForUploadResponse> {
    return http.post(STORAGE_FILE_ENDPOINTS.GET_PRESIGNED_URL, payload);
  }

  getFilesInfoUrlForUpload(payload: IGetFilesInfoPayload): Promise<IGetFilesInfoResponse> {
    return http.post(STORAGE_FILE_ENDPOINTS.GET_FILES_INFO, payload);
  }

  completeUpload(payload: ICompleteUploadPayload): Promise<ICompleteUploadResponse> {
    return http.post(STORAGE_FILE_ENDPOINTS.COMPLETE_UPLOAD, payload);
  }

  updateFileAdditionalInfo(
    payload: IUpdateFileAdditionalInfoPayload,
  ): Promise<IUpdateFileAdditionalInfoResponse> {
    return http.post(STORAGE_FILE_ENDPOINTS.UPDATE_FILE_ADDITIONAL_INFO, payload);
  }

  getFilesDownloadUrl(meta: {
    fileId: string;
    projectKey: string;
  }): Promise<IGetFileByFileIDResponse> {
    return http.get(
      `${STORAGE_FILE_ENDPOINTS.GET_FILE}?FileId=${meta.fileId}&ProjectKey=${meta.projectKey}`,
    );
  }

  prepareZipDownload(
    payload: IPrepareZipDownloadPayload,
    signal?: AbortSignal,
  ): Promise<IPrepareZipDownloadResponse> {
    return http.post(ZIP_DOWNLOAD_ENDPOINTS.PREPARE, payload, undefined, { signal });
  }
}
