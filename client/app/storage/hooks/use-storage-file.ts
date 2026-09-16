import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IGetFileByFileIDPayload,
  IGetFileByFileIDResponse,
  IGetFilesInfoPayload,
} from "../models/storage.model";
import { storageService } from "../services/storage.service";
import { useProjectStore } from "@seliseblocks/genesis-os";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

/**
 * A cached signed download URL must not outlive the provider's expiry, or a consumer (e.g. a
 * still-open preview modal, or a later click reusing the query cache) would be handed a dead URL.
 * Ties the query's staleTime to `downloadUrlExpiresAtUtc` instead of the global default so React
 * Query naturally refetches once the URL has expired: no expiry (local storage, or an
 * intentionally anonymous Public URL) keeps the global default/never-stale behavior; a past
 * expiry is immediately stale.
 */
const staleTimeFromDownloadUrlExpiry = (query: {
  state: { data?: IGetFileByFileIDResponse };
}) => {
  const expiresAt = query.state.data?.downloadUrlExpiresAtUtc;
  if (expiresAt === undefined) return 60 * 1000;
  if (expiresAt === null) return Infinity;
  return Math.max(new Date(expiresAt).getTime() - Date.now(), 0);
};

export const useGetPreSignedUrlForUpload = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();
  return useMutation({
    mutationKey: ["storage", "file", "getPresignedUrl"],
    mutationFn: storageService.file.getPreSignedUrlForUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "file", "getFilesInfo", projectKey],
      });
    },
  });
};

export const useUploadFile = () => {
  return useMutation({
    mutationKey: ["storage", "file", "getPresignedUrl"],
    mutationFn: storageService.uploadFile,
  });
};

export const useCompleteUpload = () => {
  return useMutation({
    mutationKey: ["storage", "file", "completeUpload"],
    mutationFn: storageService.file.completeUpload,
  });
};

export const useUploadFileToLocalStorage = () => {
  return useMutation({
    mutationKey: ["storage", "file", "upload"],
    mutationFn: storageService.uploadFileToLocalStorage,
  });
};

export const useGetFile = (
  option: IGetFileByFileIDPayload,
  options: { enabled?: boolean } = {},
) => {
  return useQuery({
    queryKey: ["file", option.projectKey, option],
    queryFn: () => storageService.file.getFileByFileId(option),
    enabled: options.enabled ?? true,
    staleTime: staleTimeFromDownloadUrlExpiry,
  });
};

export const useUpdateFileAdditionalInfo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["storage", "file", "updateAdditionalInfo"],
    mutationFn: storageService.file.updateFileAdditionalInfo,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["file", variables.projectKey] });
    },
  });
};

export const useLazyGetFile = () => {
  const queryClient = useQueryClient();

  const fetchFile = (option: IGetFileByFileIDPayload) => {
    return queryClient.fetchQuery({
      queryKey: ["file", option.projectKey, option],
      queryFn: () => storageService.file.getFileByFileId(option),
      staleTime: staleTimeFromDownloadUrlExpiry,
    });
  };

  return { fetchFile };
};
export const useDeleteFile = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["storage", "file", "delete"],
    mutationFn: storageService.file.deleteFileByFileId,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "file", "getFilesInfo", projectKey],
      });
    },
  });
};

export const useGetFilesInfo = (options: IGetFilesInfoPayload) => {
  const projectKey = options.projectKey || getProjectKey();
  return useQuery({
    queryKey: ["storage", "file", "getFilesInfo", projectKey, options],
    queryFn: () => storageService.file.getFilesInfoUrlForUpload(options),
  });
};

export const useGetFilesDownload = (
  meta: { fileId: string; projectKey: string },
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: ["getFilesDownload", meta.projectKey, meta.fileId],
    queryFn: () => storageService.file.getFilesDownloadUrl(meta),
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: false,
    staleTime: staleTimeFromDownloadUrlExpiry,
  });
};

export const usePublicCertificateFile = () => {
  return useMutation({
    mutationKey: ["storage", "file", "public-certificate"],
    mutationFn: storageService.uploadPublicCertificateFile,
  });
};
