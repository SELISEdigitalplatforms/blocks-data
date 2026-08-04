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
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  const [textContent, setTextContent] = useState<string>("");
  const [isLoadingText, setIsLoadingText] = useState(false);
  const extension = getNormalizedExtension(fileExtension, fileName);

  useEffect(() => {
    if (open) {
      setIsPdfLoaded(false);
      setTextContent("");
    }
  }, [open]);

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
          setTextContent("Error loading file content");
        } finally {
          setIsLoadingText(false);
        }
      }
    };

    fetchTextContent();
  }, [fileUrl, extension, open]);

  const renderFilePreview = () => {
    if (isLoading) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Preparing preview</p>
            <p className="text-sm text-muted-foreground">Retrieving a secure link to your file.</p>
          </div>
          <Progress
            value={65}
            aria-label="Loading file preview"
            className="h-1.5 w-full max-w-sm"
            indicatorClassName="animate-pulse"
          />
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
          <p className="font-medium">Unable to load file preview</p>
          <p className="text-sm text-muted-foreground">
            Try closing the dialog and opening the file again.
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
            Your browser does not support the video tag.
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
            Your browser does not support the audio tag.
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
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">{textContent}</pre>
          )}
        </ScrollArea>
      );
    }

    // For other file types, show a download link
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium">Preview not available for this file type</p>
        <p className="text-sm text-muted-foreground">
          Open or download the file to view it in its native application.
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
                {extension ? `${extension.slice(1).toUpperCase()} file preview` : "File preview"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">{renderFilePreview()}</div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          {fileUrl ? (
            <Button asChild>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                Open in new tab
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
