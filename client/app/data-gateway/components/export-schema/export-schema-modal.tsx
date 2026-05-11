"use client";

import Stepperwithoutindicator from "@/components/stepper/stepper-without-indicator";
import { Button } from "@/components/ui-kits/button/button";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { Label } from "@/components/ui-kits/label/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui-kits/radio-group/radio-group";
import { toast, showErrorToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/useProjectStore";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { ISchemaExportNotificationData } from "@/data-gateway/models/schema-import-export-notification";
import type { IGetFileByFileIDResponse } from "@/storage/models/storage.model";
import { storageService } from "@/storage/services/storage.service";
import { useQueryClient } from "@tanstack/react-query";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useSchemaExport } from "../../hooks/use-configuration";
import { SchemaExportOption, SchemaExportOptionValue } from "../../models/data-service";

const exportFormats = [{ id: "json", label: "JSON" }] as const;

type ExportFormatId = (typeof exportFormats)[number]["id"];

const OPTIONAL_KEYS = ["accessPolicies", "validationRules"] as const;
type OptionalExportKey = (typeof OPTIONAL_KEYS)[number];

interface ExportOptionRow {
  key: "schema" | OptionalExportKey;
  label: string;
  description: string;
  alwaysSelected: boolean;
}

const EXPORT_OPTIONS: ExportOptionRow[] = [
  {
    key: "schema",
    label: "Schema",
    description:
      "Structure and field access levels (Read/Write/Edit/Delete) from schema definition",
    alwaysSelected: true,
  },
  {
    key: "accessPolicies",
    label: "Access Policies",
    description: "RLS and CLS policies from data access policy",
    alwaysSelected: false,
  },
  {
    key: "validationRules",
    label: "Validation Rules",
    description: "Per-field validation rules",
    alwaysSelected: false,
  },
];

function calculateExportOption(selectedKeys: Set<string>): SchemaExportOptionValue {
  const hasAccessPolicies = selectedKeys.has("accessPolicies");
  const hasValidationRules = selectedKeys.has("validationRules");
  if (hasAccessPolicies && hasValidationRules) {
    return SchemaExportOption.All;
  }
  if (hasAccessPolicies) {
    return SchemaExportOption.AccessPolicies;
  }
  if (hasValidationRules) {
    return SchemaExportOption.ValidationRules;
  }
  return SchemaExportOption.Schema;
}

function isSelectAllChecked(selectedKeys: Set<string>): boolean {
  return OPTIONAL_KEYS.every((k) => selectedKeys.has(k));
}

/** Matches UILM-style payloads: `{ Message: { FileId } }` or a flat `{ FileId }`. */
function extractExportFileIdFromNotification(
  notificationData: ISchemaExportNotificationData,
): string | undefined {
  try {
    const raw = notificationData.message.denormalizedPayload;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const message = parsed?.Message ?? parsed;
    if (
      message &&
      typeof message === "object" &&
      "IsSuccess" in message &&
      (message as { IsSuccess?: boolean }).IsSuccess === false
    ) {
      return undefined;
    }
    const fileId = message?.FileId ?? message?.fileId ?? parsed?.FileId ?? parsed?.fileId;
    return typeof fileId === "string" && fileId.length > 0 ? fileId : undefined;
  } catch {
    return undefined;
  }
}

export default function ExportSchemaModal({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(["schema"]));
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId>(exportFormats[0].id);
  const [downloadChecked, setDownloadChecked] = useState(false);

  const queryClient = useQueryClient();
  const { mutateAsync: exportSchemaAsync, isPending: isExporting } = useSchemaExport();
  const downloadedRef = useRef(false);
  /** File IDs from the latest export request(s) we are still trying to download (superseded exports are removed). */
  const pendingExportFileIdsRef = useRef<Set<string>>(new Set());

  const handleNotificationData = useCallback(
    async (notificationData: ISchemaExportNotificationData) => {
      if (!projectKey) return;

      const fileId = extractExportFileIdFromNotification(notificationData);
      if (!fileId || !pendingExportFileIdsRef.current.has(fileId)) return;

      try {
        const file = await queryClient.fetchQuery<IGetFileByFileIDResponse>({
          queryKey: ["getFilesDownload", fileId, projectKey],
          queryFn: () => storageService.file.getFilesDownloadUrl({ fileId, projectKey }),
          staleTime: 0,
        });

        if (!pendingExportFileIdsRef.current.has(fileId)) return;

        pendingExportFileIdsRef.current.delete(fileId);

        if (file.isSuccess && file.url && !downloadedRef.current) {
          downloadedRef.current = true;
          const a = document.createElement("a");
          a.href = file.url;
          a.download = file.name?.trim() ?? "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast({
            title: "Status",
            description: "Schema export downloaded successfully.",
            variant: "success",
          });
        }
      } catch (error) {
        pendingExportFileIdsRef.current.delete(fileId);
        toast({
          title: "Download Failed",
          description: "Download failed. Please check the logs for more details.",
          variant: "destructive",
        });
      }
    },
    [projectKey, queryClient],
  );

  /** Backend notifier payload for schema export completion. */
  useNotificationListener("schema-export", handleNotificationData);

  const toggleOptionalExport = useCallback((key: OptionalExportKey, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.add("schema");
      if (!checked) {
        next.delete(key);
        return next;
      }
      const other: OptionalExportKey =
        key === "accessPolicies" ? "validationRules" : "accessPolicies";
      next.delete(other);
      next.add(key);
      return next;
    });
  }, []);

  const handleSelectAllChange = useCallback((checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add("schema");
        for (const k of OPTIONAL_KEYS) {
          next.add(k);
        }
      } else {
        for (const k of OPTIONAL_KEYS) {
          next.delete(k);
        }
      }
      return next;
    });
  }, []);

  const handleSelectFileType = () => {
    setCurrentStep(2);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleExport = async () => {
    try {
      const exportOption = calculateExportOption(selectedKeys);

      const exportResponse = await exportSchemaAsync({
        projectKey,
        messageCoRelationId: uuidv4(),
        exportOption,
      });

      if (!exportResponse.isSuccess) {
        throw new Error(exportResponse.message || "Export request failed.");
      }

      const itemId = exportResponse.data?.itemId;
      if (!itemId) {
        throw new Error("Export succeeded but no file ID was returned.");
      }

      toast({
        title: "Export in progress",
        description: "Download begins automatically when your export is ready.",
        variant: "info",
      });

      downloadedRef.current = false;
      pendingExportFileIdsRef.current.clear();
      pendingExportFileIdsRef.current.add(itemId);

      setCurrentStep(1);
      setSelectedKeys(new Set(["schema"]));
      setDownloadChecked(false);
      onClose();
    } catch (error) {
      showErrorToast({
        errors: [error instanceof Error ? error.message : "Export failed. Please try again."],
      });
    }
  };

  const selectAllChecked = isSelectAllChecked(selectedKeys);

  return (
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden rounded-md sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle className="text-left">Export Schema</DialogTitle>
        <DialogDescription className="!mt-[12px] text-sm text-medium-emphasis">
          Select the data you&apos;d like to export
        </DialogDescription>
      </DialogHeader>

      <div className="!mt-[8px] mb-8 flex-1 overflow-y-auto p-1 text-left text-high-emphasis">
        <Stepperwithoutindicator currentStep={currentStep} stepNumber={1}>
          <div className="space-y-4">
            <div className="flex flex-row items-start space-x-3 space-y-0">
              <Checkbox
                id="export-schema-select-all"
                checked={selectAllChecked}
                onCheckedChange={(checked) => handleSelectAllChange(checked === true)}
              />
              <Label htmlFor="export-schema-select-all" className="font-normal">
                Select all
              </Label>
            </div>

            <div className="flex flex-col gap-4">
              {EXPORT_OPTIONS.map((opt) => (
                <div key={opt.key} className="flex flex-row items-start space-x-3 space-y-0">
                  <Checkbox
                    id={`export-opt-${opt.key}`}
                    checked={selectedKeys.has(opt.key)}
                    disabled={opt.alwaysSelected}
                    onCheckedChange={(checked) => {
                      if (opt.key === "schema") return;
                      toggleOptionalExport(opt.key, checked === true);
                    }}
                  />
                  <div className="flex flex-col gap-0.5">
                    <Label
                      htmlFor={`export-opt-${opt.key}`}
                      className={`font-normal ${opt.alwaysSelected ? "text-medium-emphasis" : ""}`}
                    >
                      {opt.label}
                    </Label>
                    <span className="text-xs text-medium-emphasis">{opt.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Stepperwithoutindicator>

        <Stepperwithoutindicator currentStep={currentStep} stepNumber={2}>
          <div className="space-y-4 pr-4">
            <RadioGroup
              value={selectedFormat}
              onValueChange={(val) => setSelectedFormat(val as ExportFormatId)}
              className="space-y-4"
            >
              {exportFormats.map((fmt) => (
                <div key={fmt.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={fmt.id} id={`fmt-${fmt.id}`} />
                  <Label htmlFor={`fmt-${fmt.id}`}>{fmt.label}</Label>
                </div>
              ))}
            </RadioGroup>

            <div className="mt-2 text-sm text-medium-emphasis">How would you like to export?</div>

            <div className="flex flex-row items-start space-x-3 space-y-0">
              <Checkbox
                id="schema-download"
                checked={downloadChecked}
                onCheckedChange={(checked) => setDownloadChecked(checked === true)}
              />
              <Label htmlFor="schema-download" className="font-normal">
                Download
              </Label>
            </div>
          </div>
        </Stepperwithoutindicator>
      </div>

      <div className="mt-auto border-t pt-4">
        {currentStep === 1 ? (
          <div className="flex flex-row-reverse gap-2">
            <Button size="default" onClick={handleSelectFileType}>
              Select file type
            </Button>
            <DialogTrigger asChild>
              <Button variant="outline" size="default">
                Cancel
              </Button>
            </DialogTrigger>
          </div>
        ) : (
          <div className="flex justify-between">
            <DialogTrigger asChild>
              <Button variant="outline" size="default">
                Cancel
              </Button>
            </DialogTrigger>
            <div className="space-x-2">
              <Button size="default" variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button
                size="default"
                onClick={handleExport}
                disabled={!downloadChecked || isExporting}
              >
                Export
              </Button>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}
