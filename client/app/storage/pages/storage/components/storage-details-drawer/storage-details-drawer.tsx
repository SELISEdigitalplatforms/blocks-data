"use client";

import { Badge } from "@/components/ui-kits/badge/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui-kits/sheet/sheet";
import { cn, formatDate } from "@/lib/utils";
import {
  IStorageConfiguration,
  StorageStrategyType,
} from "@/storage/models/storage.model";
import { PackageOpen, X } from "lucide-react";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

interface StorageDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storage: IStorageConfiguration | null;
}

const providerColors: Record<StorageStrategyType, string> = {
  Amazon:
    "bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
  Azure: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  SftpStorage:
    "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
  S3Compatible:
    "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  AWS: "bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
};

const getProviderLabel = (provider: StorageStrategyType): string => {
  switch (provider) {
    case "Amazon":
      return "AWS";
    case "Azure":
      return "Azure";
    case "SftpStorage":
      return "SFTP";
    case "S3Compatible":
      return tStatic("data.storage", "STORAGE_DETAILS_DRAWER.AWS_S3_COMPATIBLE");
    default:
      return provider;
  }
};

export function StorageDetailsDrawer({
  open,
  onOpenChange,
  storage,
}: StorageDetailsDrawerProps) {
  const { t } = useT("data.storage");
  if (!storage) return null;

  const providerLabel = getProviderLabel(storage.storageStrategy);
  const providerColorClass = providerColors[storage.storageStrategy];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md" hideClose>
        <div className="flex h-full flex-col">
          {/* Header */}
          <SheetHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">{t("common:DETAILS")}</SheetTitle>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">{t("common:CLOSE")}</span>
              </button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              {/* Properties Section */}
              <div>
                <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                  {t("STORAGE_DETAILS_DRAWER.PROPERTIES")}
                </h3>

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {t("common:NAME")}
                    </div>
                    <div className="text-sm font-medium">{storage.name}</div>
                  </div>

                  {/* Storage Provider */}
                  <div>
                    <div className="mb-2 text-xs text-muted-foreground">
                      {t("STORAGE_DETAILS_DRAWER.STORAGE_PROVIDER")}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded",
                          providerColorClass,
                        )}
                      >
                        {storage.storageStrategy === "Amazon" && (
                          <img
                            src="/assets/images/amazon.png"
                            alt="AWS"
                            width={16}
                            height={16}
                            className="h-4 w-4 object-contain"
                          />
                        )}
                        {storage.storageStrategy === "Azure" && (
                          <img
                            src="/assets/images/azure.png"
                            alt={t("STORAGE_DETAILS_DRAWER.AZURE")}
                            width={16}
                            height={16}
                            className="h-4 w-4 object-contain"
                          />
                        )}
                        {storage.storageStrategy === "SftpStorage" && (
                          <PackageOpen className="h-4 w-4" />
                        )}
                        {storage.storageStrategy === "S3Compatible" && (
                          <img
                            src="/assets/images/amazon.png"
                            alt={t("STORAGE_DETAILS_DRAWER.AWS_S3_COMPATIBLE")}
                            width={16}
                            height={16}
                            className="h-4 w-4 object-contain"
                          />
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        {providerLabel}
                      </span>
                    </div>
                  </div>

                  {/* Owner */}
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {t("STORAGE_DETAILS_DRAWER.OWNER")}
                    </div>
                    <div className="text-sm font-medium">
                      {storage.createdBy || t("STORAGE_DETAILS_DRAWER.ME")}
                    </div>
                  </div>

                  {/* Type */}
                  <div>
                    <div className="mb-2 text-xs text-muted-foreground">
                      {t("common:TYPE")}
                    </div>
                    <Badge
                      variant="secondary"
                      className="h-6 w-fit text-xs font-medium"
                    >
                      {t("STORAGE_DETAILS_DRAWER.CONFIGURED")}
                    </Badge>
                  </div>

                  {/* Last Modified */}
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {t("STORAGE_DETAILS_DRAWER.LAST_MODIFIED")}
                    </div>
                    <div className="text-sm font-medium">
                      {formatDate(new Date(storage.lastUpdatedDate))}
                    </div>
                  </div>

                  {/* Date Created */}
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {t("STORAGE_DETAILS_DRAWER.DATE_CREATED")}
                    </div>
                    <div className="text-sm font-medium">
                      {formatDate(new Date(storage.createdDate))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
