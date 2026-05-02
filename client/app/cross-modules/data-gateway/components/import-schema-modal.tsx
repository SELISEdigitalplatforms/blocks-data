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
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { IImportFile } from "@blocks-localization/models/language";
import { ArrowDownToLine, CloudUpload, Paperclip, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ModuleName } from "@/constants/modules.constants";
import { useGetPreSignedUrlForUpload, useUploadFile } from "@blocks-storage/hooks/use-storage-file";
import { storageService } from "@blocks-storage/services/storage.service";
import { useImportSchemaFile } from "@/cross-modules/data-gateway/hooks/use-configuration";

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
      <div className="text-xs text-low-emphasis">JSON only. Maximum file 5MB</div>
    </>
  );
};

interface IImportFilesModalProps {
  projectKey: string;
  onClose(): void;
}

export default function ImportSchemaModal({ projectKey, onClose }: IImportFilesModalProps) {
  const [files, setFiles] = useState<File[] | null>(null);

  const { mutateAsync: getPresignedUrl, isPending: isGettingPresignedUrl } =
    useGetPreSignedUrlForUpload();
  const { mutateAsync: uploadFileMutate, isPending: isUploadingFile } = useUploadFile();
  const { mutateAsync: uploadSchemaFile, isPending: isUploadingSchemaFile } = useImportSchemaFile(
    {} as IImportFile,
  );
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);

  const isBusy =
    isGettingPresignedUrl || isUploadingFile || isUploadingSchemaFile || isUploadingBatch;

  const downloadTemplate = async () => {
    try {
      
      const url =
        "https://blocksstage.blob.core.windows.net/p2846e201c4784fada245995e46948632/Private/24af8ec4-c2f3-43d9-ba6f-d6bc9787b681/a4f5de39-3efa-4f36-aee5-9380b2f86a1f/schema_export_20260427180925.json?sv=2024-11-04&se=2026-04-30T18%3A09%3A26Z&sr=b&sp=r&sig=xkUYJO%2Br7EFRdqlkc0xfw4h6dLAsclTkdavUtTPM5pI%3D";
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

  // const checkActivity = () => {
  //   router.push(`/services/language?languageActivity=activity`);
  // };

  return (
    <DialogContent className="rounded-md sm:max-w-[450px]">
      {/* {!showConfirmation ? ( */}
      <>
        <DialogHeader>
          <DialogTitle className="text-left">Import</DialogTitle>
          <DialogDescription className="text-left">Import schema from a file.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col bg-warning-100 px-[12px] py-[8px]">
          <div className="flex flex-row items-center">
            <TriangleAlert className="h-4 w-4 text-icon-warning" />
            <p className="ml-[8px] text-[14px] font-semibold text-high-emphasis">JSON Format</p>
          </div>
          <p className="mt-[8px] text-[14px] text-high-emphasis">
            Please download the JSON Template and re-upload with your data to avoid any error.
          </p>
        </div>
        <FileUploader
          value={files}
          onValueChange={setFiles}
          dropzoneOptions={dropZoneConfig}
          className="relative my-2 rounded-lg"
        >
          <FileInput className="rounded border border-dashed border-border">
            <div className="flex w-full flex-col items-center justify-center py-4">
              <FileSvgDraw />
            </div>
          </FileInput>
          <FileUploaderContent>
            {files &&
              files.length > 0 &&
              files.map((file, i) => (
                <FileUploaderItem key={i} index={i}>
                  <Paperclip className="h-4 w-4 stroke-current" />
                  <span>{file.name}</span>
                </FileUploaderItem>
              ))}
          </FileUploaderContent>
        </FileUploader>

        <DialogFooter className="mr-1 grid grid-cols-2 gap-2">
          <div
            className="mt-2 flex cursor-pointer flex-row gap-2 text-primary"
            onClick={downloadTemplate}
          >
            <ArrowDownToLine size={20} />
            <h3 className="text-sm font-medium">Template</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="default"
              className="bg-primary"
              onClick={handleUpload}
              disabled={!files || files.length === 0 || isBusy}
            >
              {isBusy ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </DialogFooter>
      </>
    </DialogContent>
  );
}
