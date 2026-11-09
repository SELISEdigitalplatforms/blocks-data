"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Button } from "@/components/ui-kits/button/button";
import { Progress } from "@/components/ui-kits/progress/progress";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { ExternalLink, FileText } from "lucide-react";
import { useT } from "@seliseblocks/genesis-os/i18n";

type FilePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string | null;
  fileName: string;
  fileExtension: string;
  isLoading?: boolean;
};

export const FilePreviewModal = ({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  fileExtension,
  isLoading = false,
}: FilePreviewModalProps) => {
  const { t } = useT("data.storage");
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  const [textContent, setTextContent] = useState<string>("");
  const [isLoadingText, setIsLoadingText] = useState(false);
  const extension = getNormalizedExtension(fileExtension, fileName);

  // Clear the previous file's content each time the modal opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setIsPdfLoaded(false);
      setTextContent("");
    }
  }

  useEffect(() => {
    const fetchTextContent = async () => {
      if (!fileUrl || !open) return;

      const ext = extension;
      if ([".txt", ".json", ".xml", ".csv", ".log"].includes(ext)) {
        setIsLoadingText(true);
        try {
          const response = await fetch(fileUrl);
          if (!response.ok && response.status !== undefined) {
            throw new Error(`Preview request failed with status ${response.status}`);
          }

          const text = await response.text();
          setTextContent(text);
        } catch (error) {
          console.error("Error fetching text content:", error);
          setTextContent(t("FILE_PREVIEW_MODAL.ERROR_LOADING_FILE_CONTENT"));
        } finally {
          setIsLoadingText(false);
        }
      }
    };

    fetchTextContent();
  }, [fileUrl, extension, open, t]);

  const renderFilePreview = () => {
    if (isLoading) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("FILE_PREVIEW_MODAL.PREPARING_PREVIEW")}</p>
            <p className="text-sm text-muted-foreground">{t("FILE_PREVIEW_MODAL.RETRIEVING_A_SECURE_LINK_TO_YOUR")}</p>
          </div>
          <Progress
            value={65}
            aria-label={t("FILE_PREVIEW_MODAL.LOADING_FILE_PREVIEW")}
            className="h-1.5 w-full max-w-sm"
            indicatorClassName="animate-pulse"
          />
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
          <p className="font-medium">{t("FILE_PREVIEW_MODAL.UNABLE_TO_LOAD_FILE_PREVIEW")}</p>
          <p className="text-sm text-muted-foreground">
            {t("FILE_PREVIEW_MODAL.TRY_CLOSING_THE_DIALOG_AND_OPENING")}
          </p>
        </div>
      );
    }

    const ext = extension;

    // PDF files
    if (ext === ".pdf") {
      return (
        <div className="relative h-[70vh] w-full">
          {!isPdfLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Skeleton className="h-full w-full" />
            </div>
          )}
          <iframe
            src={fileUrl}
            className="h-full w-full rounded-md border"
            title={fileName}
            onLoad={() => setIsPdfLoaded(true)}
          />
        </div>
      );
    }

    // Image files
    if ([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp"].includes(ext)) {
      return (
        <div className="flex h-[70vh] items-center justify-center bg-muted/30">
          <img src={fileUrl} alt={fileName} className="max-h-full max-w-full object-contain" />
        </div>
      );
    }

    // Video files
    if ([".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv", ".webm"].includes(ext)) {
      return (
        <div className="flex h-[70vh] items-center justify-center bg-black">
          <video controls className="max-h-full max-w-full">
            <source src={fileUrl} type={`video/${ext.replace(".", "")}`} />
            {t("FILE_PREVIEW_MODAL.YOUR_BROWSER_DOES_NOT_SUPPORT_THE")}
          </video>
        </div>
      );
    }

    // Audio files
    if ([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"].includes(ext)) {
      return (
        <div className="flex h-[70vh] items-center justify-center">
          <audio controls className="w-full">
            <source src={fileUrl} type={`audio/${ext.replace(".", "")}`} />
            {t("FILE_PREVIEW_MODAL.YOUR_BROWSER_DOES_NOT_SUPPORT_THE_2")}
          </audio>
        </div>
      );
    }

    // Text files and others that can be embedded
    if ([".txt", ".json", ".xml", ".csv", ".log"].includes(ext)) {
      return (
        <ScrollArea className="h-[70vh] overflow-auto rounded-md border bg-background p-4">
          {isLoadingText ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton className="h-full w-full" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap wrap-break-word font-mono text-sm">{textContent}</pre>
          )}
        </ScrollArea>
      );
    }

    // For other file types, show a download link
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium">{t("FILE_PREVIEW_MODAL.PREVIEW_NOT_AVAILABLE_FOR_THIS_FILE")}</p>
        <p className="text-sm text-muted-foreground">
          {t("FILE_PREVIEW_MODAL.OPEN_OR_DOWNLOAD_THE_FILE_TO")}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate text-lg font-semibold" title={fileName}>
                {fileName}
              </DialogTitle>
              <DialogDescription>
                {extension ? t("FILE_PREVIEW_MODAL.SLICE_FILE_PREVIEW", { slice: extension.slice(1).toUpperCase() }) : t("FILE_PREVIEW_MODAL.FILE_PREVIEW")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">{renderFilePreview()}</div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline">{t("common:CLOSE")}</Button>
          </DialogClose>
          {fileUrl ? (
            <Button asChild>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                {t("FILE_PREVIEW_MODAL.OPEN_IN_NEW_TAB")}
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function getNormalizedExtension(fileExtension: string, fileName: string): string {
  const extension = fileExtension.trim() || fileName.slice(fileName.lastIndexOf("."));

  if (!extension) {
    return "";
  }

  return `${extension.startsWith(".") ? "" : "."}${extension.toLowerCase()}`;
}
