"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Button } from "@/components/ui-kits/button/button";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";

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

  useEffect(() => {
    if (open) {
      setIsPdfLoaded(false);
      setTextContent("");
    }
  }, [open]);

  useEffect(() => {
    const fetchTextContent = async () => {
      if (!fileUrl || !open) return;

      const ext = fileExtension.toLowerCase();
      if ([".txt", ".json", ".xml", ".csv", ".log"].includes(ext)) {
        setIsLoadingText(true);
        try {
          const response = await fetch(fileUrl);
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
  }, [fileUrl, fileExtension, open]);

  const renderFilePreview = () => {
    if (isLoading) {
      return (
        <div className="flex h-[70vh] items-center justify-center">
          <Skeleton className="h-full w-full" />
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="flex h-[70vh] items-center justify-center">
          <p className="text-muted-foreground">Unable to load file preview</p>
        </div>
      );
    }

    const ext = fileExtension.toLowerCase();

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Preview not available for this file type</p>
        <Button asChild variant="default">
          <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer">
            Download File
          </a>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">{fileName}</DialogTitle>
            {/* <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button> */}
          </div>
        </DialogHeader>
        <div className="p-6">{renderFilePreview()}</div>
      </DialogContent>
    </Dialog>
  );
};
