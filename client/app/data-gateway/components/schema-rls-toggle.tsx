"use client";

import { useState } from "react";

import { Switch } from "@/components/ui-kits/switch/switch";
import { InfoTooltip } from "@/components/info-tool-tip/info-tool-tip";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { useSetRowColumnPermission } from "../hooks/use-configuration";

type SchemaRlsToggleProps = {
  schemaId: string;
  projectKey: string;
  isRlsEnabled?: boolean;
  isClsEnabled?: boolean;
  className?: string;
};

export const SchemaRlsToggle = ({
  schemaId,
  projectKey,
  isRlsEnabled: initialRlsEnabled = false,
  isClsEnabled = false,
  className,
}: SchemaRlsToggleProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingRlsValue, setPendingRlsValue] = useState<boolean | null>(null);
  const [isRlsEnabled, setIsRlsEnabled] = useState<boolean>(initialRlsEnabled);

  const { mutateAsync: setRowColumnPermission, isPending: isUpdatingRowColumnPermission } =
    useSetRowColumnPermission(schemaId);

  const [prevInitialRlsEnabled, setPrevInitialRlsEnabled] = useState(initialRlsEnabled);
  if (prevInitialRlsEnabled !== initialRlsEnabled) {
    setPrevInitialRlsEnabled(initialRlsEnabled);
    setIsRlsEnabled(initialRlsEnabled);
  }

  const modalData =
    pendingRlsValue === true
      ? {
          dialogTitle: "Enable row level security?",
          dialogSubtitle: "Row level security will be enabled. Do you want to continue?",
          confirmButton: "Enable",
          cancelButton: "Cancel",
        }
      : {
          dialogTitle: "Disable row level security?",
          dialogSubtitle: isClsEnabled
            ? "Disabling row level security will also disable column level security. Do you want to continue?"
            : "Are you sure you want to disable row level security for this schema?",
          confirmButton: "Disable",
          cancelButton: "Cancel",
        };

  const handleToggle = async (checked: boolean) => {
    const previousValue = isRlsEnabled;
    setIsRlsEnabled(checked);

    const shouldDisableCls = !checked && !!isClsEnabled;

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
        const successMessage = checked
          ? "Row level security enabled successfully."
          : shouldDisableCls
            ? "Row and column level security disabled successfully."
            : "Row level security disabled successfully.";
        showSuccessToast({
          description: successMessage,
        });
        return;
      }

      showErrorToast({ errors: "Something went wrong" });
    } catch (error) {
      setIsRlsEnabled(previousValue);
      showErrorToast({ errors: error });
    }
  };

  return (
    <>
      <div className={cn("flex flex-row items-center gap-4", className)}>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>Row Level Security</span>
          <InfoTooltip content="By enabling/disabling RLS(Row Level Security) data security will be changed for the application users." />
        </div>
        <Switch
          checked={isRlsEnabled}
          onCheckedChange={(checked) => {
            if (checked === isRlsEnabled || isUpdatingRowColumnPermission) {
              return;
            }
            setPendingRlsValue(checked);
            setIsDialogOpen(true);
          }}
          disabled={isUpdatingRowColumnPermission}
          aria-label="Toggle row level security"
          aria-pressed={isRlsEnabled}
        />
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setPendingRlsValue(null);
          }
        }}
      >
        <ConfirmationModal
          onCancel={() => {
            setIsDialogOpen(false);
            setPendingRlsValue(null);
          }}
          onConfirm={async () => {
            if (pendingRlsValue === null) {
              setIsDialogOpen(false);
              return;
            }

            await handleToggle(pendingRlsValue);
            setIsDialogOpen(false);
            setPendingRlsValue(null);
          }}
          data={modalData}
          buttonState={{ confirm: { disable: isUpdatingRowColumnPermission } }}
        />
      </Dialog>
    </>
  );
};
