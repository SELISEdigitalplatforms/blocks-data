"use client";

import { useState } from "react";

import { Switch } from "@/components/ui-kits/switch/switch";
import { InfoTooltip } from "@/components/info-tool-tip/info-tool-tip";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { useSetRowColumnPermission } from "../hooks/use-configuration";

type SchemaClsToggleProps = {
  schemaId: string;
  projectKey: string;
  isClsEnabled?: boolean;
  isRlsEnabled?: boolean;
  className?: string;
};

export const SchemaClsToggle = ({
  schemaId,
  projectKey,
  isClsEnabled: initialClsEnabled = false,
  isRlsEnabled = false,
  className,
}: SchemaClsToggleProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingClsValue, setPendingClsValue] = useState<boolean | null>(null);
  const [isClsEnabled, setIsClsEnabled] = useState<boolean>(initialClsEnabled);
  const [currentRlsEnabled, setCurrentRlsEnabled] = useState<boolean>(isRlsEnabled);

  const { mutateAsync: setRowColumnPermission, isPending: isUpdatingRowColumnPermission } =
    useSetRowColumnPermission(schemaId);

  const [prevInitialClsEnabled, setPrevInitialClsEnabled] = useState(initialClsEnabled);
  if (prevInitialClsEnabled !== initialClsEnabled) {
    setPrevInitialClsEnabled(initialClsEnabled);
    setIsClsEnabled(initialClsEnabled);
  }

  const [prevIsRlsEnabled, setPrevIsRlsEnabled] = useState(isRlsEnabled);
  if (prevIsRlsEnabled !== isRlsEnabled) {
    setPrevIsRlsEnabled(isRlsEnabled);
    setCurrentRlsEnabled(isRlsEnabled);
  }

  const modalData =
    pendingClsValue === true
      ? {
          dialogTitle: "Enable column level security?",
          dialogSubtitle: currentRlsEnabled
            ? "Are you sure you want to enable column level security for this schema?"
            : "Column level security requires row level security. Enabling CLS will also enable RLS. Do you want to continue?",
          confirmButton: "Enable",
          cancelButton: "Cancel",
        }
      : {
          dialogTitle: "Disable column level security?",
          dialogSubtitle: "Are you sure you want to disable column level security for this schema?",
          confirmButton: "Disable",
          cancelButton: "Cancel",
        };

  const handleToggle = async (checked: boolean) => {
    const previousValue = isClsEnabled;
    setIsClsEnabled(checked);

    const shouldEnableRls = checked && !currentRlsEnabled;
    // const intendedRlsState = shouldEnableRls ? true : currentRlsEnabled;

    try {
      const response = await setRowColumnPermission({
        projectKey,
        schemaId,
        operation: 1,
        policyType: 0,
        fieldNames: [],
        accessLevel: 0,
      });

      if (response?.isSuccess) {
        if (shouldEnableRls) {
          setCurrentRlsEnabled(true);
        }
        const successMessage = checked
          ? shouldEnableRls
            ? "Column and row level security enabled successfully."
            : "Column level security enabled successfully."
          : "Column level security disabled successfully.";
        showSuccessToast({
          description: successMessage,
        });
        return;
      }

      showErrorToast({ errors: "Something went wrong" });
    } catch (error) {
      setIsClsEnabled(previousValue);
      showErrorToast({ errors: error });
    }
  };

  return (
    <>
      <div className={cn("flex flex-row items-center gap-4", className)}>
        <div className="flex flex-row items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>Column Level Security</span>
            <InfoTooltip content="By enabling/disabling CLS(Column Level Security) column security will be changed for the application." />
          </div>
          <Switch
            checked={isClsEnabled}
            onCheckedChange={(checked) => {
              if (checked === isClsEnabled || isUpdatingRowColumnPermission) {
                return;
              }
              setPendingClsValue(checked);
              setIsDialogOpen(true);
            }}
            disabled={isUpdatingRowColumnPermission}
            aria-label="Toggle column level security"
            aria-pressed={isClsEnabled}
          />
        </div>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setPendingClsValue(null);
          }
        }}
      >
        <ConfirmationModal
          onCancel={() => {
            setIsDialogOpen(false);
            setPendingClsValue(null);
          }}
          onConfirm={async () => {
            if (pendingClsValue === null) {
              setIsDialogOpen(false);
              return;
            }

            await handleToggle(pendingClsValue);
            setIsDialogOpen(false);
            setPendingClsValue(null);
          }}
          data={modalData}
          buttonState={{ confirm: { disable: isUpdatingRowColumnPermission } }}
        />
      </Dialog>
    </>
  );
};
