import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ICreateDmsFolderPayload,
  IGetDmsFileAndFolderPayload,
  IGetFileByFileIDPayload,
  IGetFilesInfoPayload,
  IUploadDmsFilePayload,
} from "../models/storage.model";
import { storageService } from "../services/storage.service";
import { useProjectStore } from "@seliseblocks/blocks-kit";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

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

export const useUploadFileToLocalStorage = () => {
  return useMutation({
    mutationKey: ["storage", "file", "upload"],
    mutationFn: storageService.uploadFileToLocalStorage,
  });
};

export const useGetFile = (option: IGetFileByFileIDPayload) => {
  return useQuery({
    queryKey: ["file", option.projectKey, option],
    queryFn: () => storageService.file.getFileByFileId(option),
  });
};

export const useLazyGetFile = () => {
  const queryClient = useQueryClient();

  const fetchFile = (option: IGetFileByFileIDPayload) => {
    return queryClient.fetchQuery({
      queryKey: ["file", option.projectKey, option],
      queryFn: () => storageService.file.getFileByFileId(option),
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

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["storage", "folder", "delete"],
    mutationFn: storageService.file.deleteFolderByFileId,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "folder", "getFolderInfo", projectKey],
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
  });
};

export const usePublicCertificateFile = () => {
  return useMutation({
    mutationKey: ["storage", "file", "public-certificate"],
    mutationFn: storageService.uploadPublicCertificateFile,
  });
};

export const useGetDmsFileAndFolder = () => {
  return useMutation({
    mutationKey: ["storage", "file", "dms-file-and-folder"],
    mutationFn: (payload: IGetDmsFileAndFolderPayload) =>
      storageService.getFilesAndFolders(payload),
  });
};

export const useUploadDmsFile = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["upload", "dms-file"],
    mutationFn: (payload: IUploadDmsFilePayload) => storageService.uploadDmsFile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "file", "dms-file-and-folder", projectKey],
      });
    },
  });
};

export const useCreateDmsFolder = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["create-folder", "dms-folder"],
    mutationFn: (payload: ICreateDmsFolderPayload) => storageService.createDmsFolder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["storage", "file", "dms-file-and-folder", projectKey],
      });
    },
  });
};
