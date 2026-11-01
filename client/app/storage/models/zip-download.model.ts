export interface IPrepareZipDownloadPayload {
  fileIds: string[];
  directoryIds: string[];
  configurationName?: string;
  zipName?: string;
}

export interface IPrepareZipDownloadResponse {
  ticket: string;
  tenantId: string;
  fileCount: number;
  totalBytes: number;
  zipName: string;
}

export type ZipDownloadStatus = "preparing" | "started" | "failed";

export interface ZipDownloadRow {
  id: string;
  label: string;
  status: ZipDownloadStatus;
  zipName?: string;
  totalBytes?: number;
  error?: string;
  controller: AbortController;
}
