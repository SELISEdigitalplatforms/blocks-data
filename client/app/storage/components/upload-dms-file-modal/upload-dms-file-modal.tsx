"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui-kits/dialog/dialog";
import { Button } from "@/components/ui-kits/button/button";
import { CloudUpload, XCircle } from "lucide-react";
import {
  FileUploader,
  FileInput,
} from "@/components/file-uploader/file-uploader";
import { showSuccessToast, showErrorToast } from "@/hooks/use-toast";
import {
  useGetPreSignedUrlForUpload,
  useUploadFile,
} from "@/storage/hooks/use-storage-file";
import { isErrorWithErrors } from "@/lib/error";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ModuleName } from "@/constants/modules.constants";

type UploadDmsFileModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  configurationName: string;
  name: string;
  parentId?: string;
  dmsWorkspaceId: string;
  dmsWorkspaceName: string;
  onUploadSuccess?: () => void;
};

export const UploadDmsFileModal = ({
  open,
  onOpenChange,
  name,
  parentId = "",
  onUploadSuccess,
}: UploadDmsFileModalProps) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [files, setFiles] = useState<File[]>([]);
  const [, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { mutateAsync: presignedMutate } = useGetPreSignedUrlForUpload();
  const { mutateAsync: uploadfileMutate } = useUploadFile();

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const processFile = async (file: File) => {
    try {
      // Step 1: Get presigned URL
      const payload = {
        name: file.name,
        projectKey,
        configurationName: name,
        accessModifier: "Public",
        metaData: "",
        parentDirectoryId: parentId || "",
        tags: "",
        moduleName: ModuleName.DefaultCloud,
      };

      const presignedUrlResponse = await presignedMutate(payload);
      if (!presignedUrlResponse.isSuccess) {
        throw new Error("Failed to get upload URL");
      }

      // Step 2: Upload file to presigned URL
      await uploadfileMutate({
        url: presignedUrlResponse.uploadUrl,
        file,
      });

      return {
        fileId: presignedUrlResponse.fileId,
        fileName: file.name,
      };
    } catch (error) {
      console.error("Error processing file:", error);
      throw error;
    }
  };

  const uploadFileHandler = async () => {
    setIsUploading(true);
    try {
      // Step 1: get presigned URL (backend creates the File + FileVersion stub).
      // Step 2: PUT the file bytes to the presigned URL. No separate register call.
      const uploadedFiles = await Promise.all(files.map(processFile));

      if (uploadedFiles.length < 1) {
        showErrorToast({ errors: "Failed to upload files" });
        return;
      }

      showSuccessToast({
        description: `${uploadedFiles.length} file(s) uploaded successfully!`,
      });

      // Reset state
      setFiles([]);
      setPreviews([]);
      onOpenChange(false);

      // Trigger refresh callback
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: unknown) {
      showErrorToast({
        errors: isErrorWithErrors(err)
          ? err.errors
          : err instanceof Error
            ? err.message
            : String(err),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const disabled = files.length === 0 || isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          document.body.style.pointerEvents = "";
        }}
      >
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload files to your DMS workspace
          </DialogDescription>
        </DialogHeader>

        <FileUploader
          value={files}
          onValueChange={(next) => setFiles(next || [])}
          dropzoneOptions={{
            maxFiles: 10,
            maxSize: 100 * 1024 * 1024, // 100MB
            multiple: true,
          }}
        >
          <FileInput className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4">
            <CloudUpload className="h-8 w-8 text-low-emphasis" />
            <p className="text-sm leading-5">
              <span className="font-semibold text-primary">
                Click to upload
              </span>
              <span className="font-normal"> or drag and drop</span>
            </p>
            <span className="text-xs text-muted-foreground">
              Upload any file type (Max 10 files, 100MB each)
            </span>
          </FileInput>
        </FileUploader>

        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4">
            {files.map((f, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="relative h-32 w-32 overflow-hidden rounded border bg-muted/30 p-4">
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute right-0 top-0 z-10 rounded-full bg-white text-gray-400 shadow hover:text-gray-600"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-xs text-muted-foreground">
                      {f.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p
                  className="mt-1 w-32 truncate text-center text-xs"
                  title={f.name}
                >
                  {f.name}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex flex-col justify-end gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button
              variant="outline"
              disabled={isUploading}
              className="w-full sm:w-20"
              size="sm"
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={uploadFileHandler}
            disabled={disabled}
            className="w-full sm:w-20"
            size="sm"
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
