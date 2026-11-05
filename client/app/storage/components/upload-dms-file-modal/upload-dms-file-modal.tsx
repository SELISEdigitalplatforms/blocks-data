"use client";

import React, { useState } from "react";
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
import {
  useCompleteUpload,
  useGetPreSignedUrlForUpload,
  useUploadFile,
} from "@/storage/hooks/use-storage-file";
import { isErrorWithErrors } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { ModuleName } from "@/constants/modules.constants";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_STORAGE_MODULE = "data.storage";

const GENERAL_ACCESS_OPTIONS = [
  { value: "", get label() { return tStatic(DATA_STORAGE_MODULE, "UPLOAD_DMS_FILE_MODAL.DEFAULT_UNRESTRICTED_UNTIL_SHARED"); } },
  { value: "Creator", get label() { return tStatic(DATA_STORAGE_MODULE, "UPLOAD_DMS_FILE_MODAL.ONLY_ME_UNTIL_I_SHARE_IT"); } },
  { value: "Organization", get label() { return tStatic(DATA_STORAGE_MODULE, "UPLOAD_DMS_FILE_MODAL.ANYONE_IN_MY_ORGANIZATION"); } },
] as const;

/** "Public" or "Private" only - this is the storage access modifier, kept separate from the
 * object-sharing "Default access" selector above. Private is the safe default. */
const STORAGE_ACCESS_OPTIONS = [
  { value: "Private", get label() { return tStatic(DATA_STORAGE_MODULE, "UPLOAD_DMS_FILE_MODAL.PRIVATE"); } },
  { value: "Public", get label() { return tStatic(DATA_STORAGE_MODULE, "UPLOAD_DMS_FILE_MODAL.PUBLIC"); } },
] as const;

type StorageAccessModifier = (typeof STORAGE_ACCESS_OPTIONS)[number]["value"];

/** Matches `Constants.DefaultMaxFileSizeInBytes` server-side; used until the configured value is available. */
const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** The first non-empty message in a rejected pre-signed request's `errors` (for example the server's `Name` rule), if any. */
const firstServerError = (errors: unknown): string | undefined => {
  if (!errors || typeof errors !== "object") return undefined;
  return Object.values(errors).find((value): value is string => typeof value === "string" && value.length > 0);
};

type FileOutcome =
  | { name: string; status: "uploaded" }
  | { name: string; status: "rejected"; reason?: string | null }
  | { name: string; status: "failed"; error: unknown };

/** Best-effort SHA-256 of the file's bytes. Returns undefined (never throws) when Web Crypto isn't
 * available in this environment - completion then simply skips checksum verification. */
const computeSha256Hex = async (file: File): Promise<string | undefined> => {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
};

type UploadDmsFileModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  configurationName: string;
  name: string;
  parentId?: string;
  dmsWorkspaceId: string;
  dmsWorkspaceName: string;
  /** Configured maximum upload size in bytes. Falls back to the documented server default when not supplied. */
  maxFileSizeInBytes?: number;
  onUploadSuccess?: () => void;
};

export const UploadDmsFileModal = ({
  open,
  onOpenChange,
  name,
  parentId = "",
  maxFileSizeInBytes,
  onUploadSuccess,
}: UploadDmsFileModalProps) => {
  const { t } = useT(DATA_STORAGE_MODULE);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [objectAccessLevel, setObjectAccessLevel] = useState("");
  const [accessModifier, setAccessModifier] = useState<StorageAccessModifier>("Private");

  const maxSize = maxFileSizeInBytes && maxFileSizeInBytes > 0 ? maxFileSizeInBytes : DEFAULT_MAX_FILE_SIZE_BYTES;

  const { mutateAsync: presignedMutate } = useGetPreSignedUrlForUpload();
  const { mutateAsync: uploadfileMutate } = useUploadFile();
  const { mutateAsync: completeUploadMutate } = useCompleteUpload();


  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isUploading) {
      setFiles([]);
      setObjectAccessLevel("");
      setAccessModifier("Private");
    }

    onOpenChange(nextOpen);
  };

  const processFile = async (file: File): Promise<FileOutcome> => {
    // Step 1: Get presigned URL. The backend decides whether completion is required for the
    // selected modifier under this configuration - the client only reports what it declared.
    const checksum = await computeSha256Hex(file);
    const payload = {
      name: file.name,
      projectKey,
      configurationName: name,
      accessModifier,
      objectAccessLevel: objectAccessLevel || undefined,
      metaData: "",
      parentDirectoryId: parentId || "",
      tags: "",
      moduleName: ModuleName.DefaultCloud,
      sizeInBytes: file.size,
      contentType: file.type || undefined,
      checksum,
      checksumAlgorithm: checksum ? "SHA256" : undefined,
    };

    const presignedUrlResponse = await presignedMutate(payload);
    if (!presignedUrlResponse.isSuccess) {
      throw new Error(firstServerError(presignedUrlResponse.errors) ?? t("UPLOAD_DMS_FILE_MODAL.FAILED_TO_GET_UPLOAD_URL"));
    }

    // Step 2: PUT the file bytes to the presigned URL, using whatever headers this provider requires.
    await uploadfileMutate({
      url: presignedUrlResponse.uploadUrl,
      file,
      headers: presignedUrlResponse.requiredHeaders,
    });

    // Step 3: only call complete-upload when the backend says this modifier requires it. A
    // completion-disabled upload is already done and readable.
    if (!presignedUrlResponse.uploadCompletionRequired || !presignedUrlResponse.fileVersionId) {
      return { name: file.name, status: "uploaded" };
    }

    const completion = await completeUploadMutate({
      fileId: presignedUrlResponse.fileId,
      fileVersionId: presignedUrlResponse.fileVersionId,
    });

    if (completion.verificationStatus === "Verified") {
      return { name: file.name, status: "uploaded" };
    }

    // A verification rejection is not the same failure as an upload/network error - it must be
    // reported distinctly rather than folded into a generic "upload failed" message.
    return { name: file.name, status: "rejected", reason: completion.rejectionReason };
  };

  const uploadFileHandler = async () => {
    setIsUploading(true);
    try {
      const settled = await Promise.allSettled(files.map(processFile));

      // Every file is attempted independently: one file's rejection or failure must not hide
      // another file's success, and every outcome is reported.
      const outcomes: FileOutcome[] = settled.map((result, index) =>
        result.status === "fulfilled"
          ? result.value
          : { name: files[index].name, status: "failed", error: result.reason },
      );

      const uploaded = outcomes.filter((o) => o.status === "uploaded");
      const rejected = outcomes.filter((o) => o.status === "rejected");
      const failed = outcomes.filter((o) => o.status === "failed");

      if (uploaded.length > 0) {
        showSuccessToast({
          description: t("UPLOAD_DMS_FILE_MODAL.LENGTH_FILE_S_UPLOADED_SUCCESSFULLY", { length: uploaded.length }),
        });
      }

      if (rejected.length > 0) {
        showErrorToast({
          errors: rejected
            .map((o) =>
              o.reason
                ? `${o.name}: ${t("UPLOAD_DMS_FILE_MODAL.REJECTED_REASON", { reason: o.reason })}`
                : `${o.name}: ${t("UPLOAD_DMS_FILE_MODAL.REJECTED")}`,
            )
            .join(", "),
        });
      }

      if (failed.length > 0) {
        showErrorToast({
          errors: failed
            .map((o) => {
              const error = o.status === "failed" ? o.error : undefined;
              const message = isErrorWithErrors(error)
                ? error.errors
                : error instanceof Error
                  ? error.message
                  : String(error);
              return `${o.name}: ${message}`;
            })
            .join(", "),
        });
      }

      if (uploaded.length === 0) {
        return;
      }

      // Reset state
      setFiles([]);
      setObjectAccessLevel("");
      setAccessModifier("Private");
      handleOpenChange(false);

      // Trigger refresh callback
      if (onUploadSuccess) {
        onUploadSuccess();
      }
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
              <DialogTitle>{t("UPLOAD_DMS_FILE_MODAL.UPLOAD_FILE")}</DialogTitle>
              <DialogDescription>
                {t("UPLOAD_DMS_FILE_MODAL.ADD_UP_TO_10_FILES" , { size: Math.round(maxSize / 1024 / 1024) })}
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
                maxSize,
                multiple: true,
              }}
            >
              <FileInput className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/3 px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CloudUpload className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">{t("UPLOAD_DMS_FILE_MODAL.CHOOSE_FILES_OR_DRAG_THEM_HERE")}</p>
                <span className="text-xs text-muted-foreground">{t("UPLOAD_DMS_FILE_MODAL.ALL_FILE_TYPES_SUPPORTED")}</span>
              </FileInput>
            </FileUploader>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("UPLOAD_DMS_FILE_MODAL.STORAGE_ACCESS")}</span>
            <fieldset
              aria-label={t("UPLOAD_DMS_FILE_MODAL.STORAGE_ACCESS")}
              className="m-0 min-w-0 inline-flex overflow-hidden rounded-sm border border-input"
            >
              {STORAGE_ACCESS_OPTIONS.map((o) => {
                const active = accessModifier === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setAccessModifier(o.value)}
                    disabled={isUploading}
                    className={cn(
                      "border-r border-input px-3 py-1.5 text-sm font-medium transition-colors last:border-r-0 focus:relative focus:outline-hidden focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                );
              })}
            </fieldset>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("UPLOAD_DMS_FILE_MODAL.DEFAULT_ACCESS")}</span>
            <fieldset
              aria-label={t("UPLOAD_DMS_FILE_MODAL.DEFAULT_ACCESS")}
              className="m-0 min-w-0 inline-flex overflow-hidden rounded-sm border border-input"
            >
              {GENERAL_ACCESS_OPTIONS.map((o) => {
                const active = objectAccessLevel === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setObjectAccessLevel(o.value)}
                    disabled={isUploading}
                    className={cn(
                      "border-r border-input px-3 py-1.5 text-sm font-medium transition-colors last:border-r-0 focus:relative focus:outline-hidden focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={active}
                  >
                    {o.label}
                  </button>
                );
              })}
            </fieldset>
          </div>

          {files.length > 0 ? (
            <section aria-label={t("UPLOAD_DMS_FILE_MODAL.FILES_READY_TO_UPLOAD")} className="space-y-2">
              <p className="text-sm font-medium">
                {t("UPLOAD_DMS_FILE_MODAL.READY_TO_UPLOAD")}
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
                      aria-label={t("UPLOAD_DMS_FILE_MODAL.REMOVE_NAME", { name: file.name })}
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
              {t("UPLOAD_DMS_FILE_MODAL.UPLOADING_FILES", { count: files.length })}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isUploading}>
              {t("common:CANCEL")}
            </Button>
          </DialogClose>
          <Button onClick={uploadFileHandler} disabled={disabled}>
            {isUploading ? t("UPLOAD_DMS_FILE_MODAL.UPLOADING_2") : t("common:UPLOAD")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
