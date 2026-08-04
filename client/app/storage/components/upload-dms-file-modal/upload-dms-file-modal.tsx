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
import { CloudUpload, FileText, LoaderCircle, XCircle } from "lucide-react";
import { FileUploader, FileInput } from "@/components/file-uploader/file-uploader";
import { showSuccessToast, showErrorToast } from "@/hooks/use-toast";
import { useGetPreSignedUrlForUpload, useUploadFile } from "@/storage/hooks/use-storage-file";
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

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isUploading) {
      setFiles([]);
      setPreviews([]);
    }

    onOpenChange(nextOpen);
  };

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
      handleOpenChange(false);

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          document.body.style.pointerEvents = "";
        }}
      >
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CloudUpload className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <DialogTitle>Upload File</DialogTitle>
              <DialogDescription>
                Add up to 10 files to this directory. Each file can be up to 100 MB.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div
            aria-busy={isUploading}
            className={isUploading ? "pointer-events-none opacity-60" : undefined}
          >
            <FileUploader
              value={files}
              onValueChange={(next) => setFiles(next || [])}
              dropzoneOptions={{
                maxFiles: 10,
                maxSize: 100 * 1024 * 1024,
                multiple: true,
              }}
            >
              <FileInput className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.06]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CloudUpload className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">Choose files or drag them here</p>
                <span className="text-xs text-muted-foreground">All file types supported</span>
              </FileInput>
            </FileUploader>
          </div>

          {files.length > 0 ? (
            <section aria-label="Files ready to upload" className="space-y-2">
              <p className="text-sm font-medium">
                Ready to upload{" "}
                <span className="font-normal text-muted-foreground">({files.length})</span>
              </p>
              <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(index)}
                      disabled={isUploading}
                      className="rounded-full text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none"
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isUploading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Uploading {files.length} {files.length === 1 ? "file" : "files"}…
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isUploading}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={uploadFileHandler} disabled={disabled}>
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
