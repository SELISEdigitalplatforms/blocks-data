import {
  FileInput,
  FileUploader,
  FileUploaderContent,
  FileUploaderItem,
} from "@/components/file-uploader/file-uploader";
import { Button } from "@/components/ui-kits/button/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { ModuleName } from "@/constants/modules.constants";
import { useImportSchemaFile } from "@/data-gateway/hooks/use-configuration";
import { IImportFile } from "@/data-gateway/models/schema-import-export-notification";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import {
  useGetPreSignedUrlForUpload,
  useUploadFile,
} from "@/storage/hooks/use-storage-file";
import { storageService } from "@/storage/services/storage.service";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  ArrowDownToLine,
  CloudUpload,
  Paperclip,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

const FileSvgDraw = () => {
  return (
    <>
      <div className="mb-3 h-8 w-8 text-border-medium-emphasis">
        <CloudUpload />
      </div>
      <div className="mb-1 text-sm text-high-emphasis">
        <span className="font-semibold text-primary">Click to upload</span>
        &nbsp; or drag and drop
      </div>
      <div className="text-xs text-low-emphasis">
        JSON only. Maximum file 5MB
      </div>
    </>
  );
};

interface IImportFilesModalProps {
  projectKey: string;
  onClose(): void;
}

export default function ImportSchemaModal({
  projectKey,
  onClose,
}: IImportFilesModalProps) {
  const [files, setFiles] = useState<File[] | null>(null);

  const { mutateAsync: getPresignedUrl, isPending: isGettingPresignedUrl } =
    useGetPreSignedUrlForUpload();
  const { mutateAsync: uploadFileMutate, isPending: isUploadingFile } =
    useUploadFile();
  const { mutateAsync: uploadSchemaFile, isPending: isUploadingSchemaFile } =
    useImportSchemaFile({} as IImportFile);
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);

  const isBusy =
    isGettingPresignedUrl ||
    isUploadingFile ||
    isUploadingSchemaFile ||
    isUploadingBatch;

  const downloadTemplate = async () => {
    try {
      const url = getRuntimeEnv("BLOCKS_DATA_IMPORT_SAMPLE_FILE");

      const filename = "SCHEMA_TEMPLATE.json";

      if (!url) throw new Error("No URL received");

      // Fetch as blob
      const response = await fetch(url);
      if (!response.ok) throw new Error("File fetch failed");
      const blob = await response.blob();

      // Create a temporary object URL
      const blobUrl = window.URL.createObjectURL(blob);

      // Trigger download
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      showErrorToast({ errors: "Failed to download template" });
    }
  };

  const dropZoneConfig = {
    maxFiles: 1,
    maxSize: 1024 * 1024 * 5, // 5MB as mentioned in the UI
    multiple: false,
    accept: {
      "application/json": [".json"],
    },
  };

  const uploadFile = async (file: File) => {
    try {
      const res = await getPresignedUrl({
        itemId: "",
        accessModifier: "Public",
        configurationName: "Default",
        name: file.name,
        projectKey,
        tags: "",
        metaData: "",
        parentDirectoryId: "",
        moduleName: ModuleName.DataGateway,
      });

      if (!res.isSuccess) {
        throw new Error("Failed to get pre-signed URL");
      }

      const fileId = res.fileId;
      await uploadFileMutate({ url: res.uploadUrl, file });

      const uploadedFile = await storageService.file.getFileByFileId({
        itemId: fileId,
        projectKey,
      });

      const payload: IImportFile = {
        messageCoRelationId: uuidv4(),
        fileId,
        projectKey,
      };

      await uploadSchemaFile(payload);

      return {
        fileId: uploadedFile.itemId,
        url: uploadedFile.url,
        name: file.name,
      };
    } catch (error) {
      console.error(`Error uploading file ${file.name}:`, error);

      throw error;
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      showErrorToast({ errors: "Please select files to upload" });
      return;
    }

    setIsUploadingBatch(true);

    try {
      const uploadPromises = files.map((file) => uploadFile(file));
      await Promise.all(uploadPromises);

      // reset & close
      setFiles(null);
      onClose(); // <-- close the modal

      showSuccessToast({ description: "Processing schema upload" });
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      } else {
        showErrorToast({ errors: "Something went wrong during upload" });
      }
    } finally {
      setIsUploadingBatch(false);
    }
  };


  return (
    <DialogContent className="rounded-sm border border-border/40 sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CloudUpload className="h-4 w-4 text-indigo-400" />
          Import
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground/60">
          Import schema from a file.
        </DialogDescription>
      </DialogHeader>

      {/* Warning card */}
      <div className="flex flex-col gap-1.5 rounded-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          <p className="text-xs font-semibold text-amber-400/80">JSON Format</p>
        </div>
        <p className="text-xs text-amber-300/60">
          Please download the JSON Template and re-upload with your data to avoid any error.
        </p>
      </div>

      {/* File uploader */}
      <FileUploader value={files} onValueChange={setFiles} dropzoneOptions={dropZoneConfig} className="relative my-1">
        <FileInput className="rounded-sm border border-dashed border-border/30 bg-muted/5 hover:bg-muted/10 transition-colors">
          <div className="flex w-full flex-col items-center justify-center py-5">
            <FileSvgDraw />
          </div>
        </FileInput>
        <FileUploaderContent>
          {files && files.length > 0 && files.map((file, i) => (
            <FileUploaderItem key={i} index={i}>
              <Paperclip className="h-4 w-4 stroke-current" />
              <span>{file.name}</span>
            </FileUploaderItem>
          ))}
        </FileUploaderContent>
      </FileUploader>

      <DialogFooter className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-indigo-400/70 transition-colors hover:text-indigo-400"
          onClick={downloadTemplate}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Template
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="border border-border/40 text-muted-foreground/70" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]"
            onClick={handleUpload}
            disabled={!files || files.length === 0 || isBusy}
          >
            {isBusy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
