"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import { MoreVertical, PackageOpen, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { StorageStrategyType } from "@blocks-storage/models/storage.model";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";

// TODO: Uncomment when status feature is implemented
// export type StorageCardStatus = "Connected" | "Configured";

export interface StorageCardData {
  id: string;
  provider: StorageStrategyType;
  // status: StorageCardStatus; // TODO: Uncomment when status feature is implemented
  providerIcon: string;
  providerColor: string;
  title: string;
  subtitle: string;
  // folderCount: number; // TODO: Uncomment when folder/file count feature is implemented
  // fileCount: number; // TODO: Uncomment when folder/file count feature is implemented
}

type StorageCardProps = {
  data: StorageCardData;
  onClick?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDisconnect?: (id: string) => void;
};

// Provider icon mapping (not currently used - component uses inline SVGs)
// const providerIcons: Record<StorageStrategyType, string> = {
//   Amazon: "aws",
//   Azure: "azure",
//   SftpStorage: "sftp",
// };

// Provider color classes for the icon background
const providerColors: Record<StorageStrategyType, string> = {
  Amazon: "bg-orange-100 text-orange-600",
  Azure: "bg-blue-100 text-blue-600",
  SftpStorage: "bg-green-100 text-green-600",
  S3Compatible: "bg-purple-100 text-purple-600",
};

export const StorageCard = ({
  data,
  onClick,
  onViewDetails,
  // onRemove,
  // _onDisconnect, // TODO: Uncomment when status feature is implemented
}: StorageCardProps) => {
  const handleClick = () => {
    if (onClick) {
      onClick(data.id);
    }
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewDetails) {
      onViewDetails(data.id);
    }
  };

  // const handleRemoveOrDisconnect = (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   TODO: Uncomment when status feature is implemented
  //   if (data.status === "Configured" && onRemove) {
  //     onRemove(data.id);
  //   } else if (data.status === "Connected" && onDisconnect) {
  //     onDisconnect(data.id);
  //   }
  //   if (onRemove) {
  //     onRemove(data.id);
  //   }
  // };

  // TODO: Uncomment when status feature is implemented
  // const statusVariant = data.status === "Connected" ? "success" : "secondary";
  const providerColorClass = providerColors[data.provider];

  return (
    <Card
      onClick={handleClick}
      className={cn(
        "cursor-pointer shadow-none transition-shadow duration-200 hover:shadow-md",
        "relative flex h-full flex-col",
      )}
    >
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-1 items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md",
              providerColorClass,
            )}
          >
            {data.provider === "Amazon" && (
              <img
                src="/assets/images/amazon.png"
                alt="AWS"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
            )}
            {data.provider === "Azure" && (
              <img
                src="/assets/images/azure.png"
                alt="Azure"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
            )}
            {data.provider === "SftpStorage" && <PackageOpen className="h-5 w-5" />}
            {data.provider === "S3Compatible" && (
              <img
                src="/assets/images/amazon.png"
                alt="AWS S3 Compatible"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {/* TODO: Uncomment when status feature is implemented */}
            {/* <div className="mb-2">
              <Badge variant={statusVariant} className="h-5 w-fit text-xs font-medium">
                {data.status}
              </Badge>
            </div> */}
            <CardTitle className="line-clamp-2 text-base font-semibold leading-tight">
              {data.subtitle}
            </CardTitle>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={handleViewDetails} className="cursor-pointer">
              <Info className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {/* <DropdownMenuItem
              onClick={handleRemoveOrDisconnect}
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              TODO: Uncomment when status feature is implemented
              {data.status === "Configured" ? (
                <>
                  <Trash className="mr-2 h-4 w-4" />
                  Remove
                </>
              ) : (
                <>
                  <Unplug className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              )}
              <Trash className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      {/* TODO: Uncomment when folder/file count feature is implemented */}
      {/* <CardContent className="flex flex-col gap-2 pt-0">
        <div className="flex items-center gap-3 text-xs text-low-emphasis">
          <div className="flex items-center gap-1">
            <Folder className="h-3.5 w-3.5" />
            <span>{data.folderCount} folders</span>
          </div>
          <div className="flex items-center gap-1">
            <File className="h-3.5 w-3.5" />
            <span>{data.fileCount} files</span>
          </div>
        </div>
      </CardContent> */}
    </Card>
  );
};
