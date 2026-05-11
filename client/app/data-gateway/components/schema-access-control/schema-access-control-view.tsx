"use client";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import {
  ACCESS_DESCRIPTIONS,
  ACCESS_LABELS,
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_STYLES,
  ACCESS_TYPE_TO_LEVEL,
  ACCESS_TYPES,
  ACCESS_TYPE_LABELS,
  POLICY_TYPE,
} from "@/data-gateway/constants/schema-access-control";
import { Loader } from "lucide-react";
import { SchemaAccessControlViewProps } from "@/data-gateway/models/schema-preview.types";
import type { IPolicyItem } from "@/data-gateway/models/data-service";
import { ACCESS_ICONS } from "@/data-gateway/constants/access-icons.constants";
import { RuleSetForm } from "./rule-set-form";
import { SchemaAccessControlAccordion } from "./schema-access-control-accordion";
import {
  useGetPolicyData,
  useSetRowColumnPermission,
} from "@/data-gateway/hooks/use-configuration";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/useProjectStore";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";

export const SchemaAccessControlView = ({
  schemaFields,
  schemaName,
  schemaId,
  level,
  operation,
  fieldNames,
  defaultAccessLevel,
}: SchemaAccessControlViewProps) => {
  const [showRuleSetForm, setShowRuleSetForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<IPolicyItem | undefined>(undefined);
  const [selectedAccessType, setSelectedAccessType] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingAccessType, setPendingAccessType] = useState<string | null>(null);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  // Fetch when access is custom, including first paint (selectedAccessType is still "" until useEffect).
  // Also fetch when defaultAccessLevel is unknown and we haven't yet determined the type.
  const defaultResolvedType =
    defaultAccessLevel !== undefined ? ACCESS_LEVEL_TO_TYPE[defaultAccessLevel] : undefined;
  const defaultLevelUnmapped =
    defaultAccessLevel !== undefined && defaultResolvedType === undefined;
  const isPolicyFetchEnabled =
    selectedAccessType === ACCESS_TYPES.CUSTOM ||
    defaultResolvedType === ACCESS_TYPES.CUSTOM ||
    (defaultAccessLevel === undefined && !initialized) ||
    (defaultLevelUnmapped && !initialized);

  const {
    data: policyResponse,
    refetch,
    isPending,
    isFetching,
  } = useGetPolicyData({
    entityName: schemaName,
    projectKey,
    enabled: isPolicyFetchEnabled,
  });

  const isPolicyListLoading =
    isPolicyFetchEnabled && (isPending || (isFetching && policyResponse === undefined));
  const { mutateAsync: setRowColumnPermission, isPending: isUpdating } =
    useSetRowColumnPermission(schemaId);

  const allPolicies = policyResponse?.isSuccess ? policyResponse.data : [];
  const isRowLevel = fieldNames.length === 0;
  const policies = allPolicies.filter((p) => {
    if (p.operation !== operation) return false;
    if (isRowLevel) {
      return !p.fieldNames || p.fieldNames.length === 0;
    }
    return (
      p.fieldNames && p.fieldNames.length > 0 && p.fieldNames.some((f) => fieldNames.includes(f))
    );
  });

  // Server / parent field access level is source of truth whenever it is known (refetch after save).
  useEffect(() => {
    if (defaultAccessLevel === undefined) return;
    const resolved = ACCESS_LEVEL_TO_TYPE[defaultAccessLevel];
    if (!resolved) return;
    setSelectedAccessType(resolved);
    setInitialized(true);
    if (resolved !== ACCESS_TYPES.CUSTOM) {
      setShowRuleSetForm(false);
      setEditingPolicy(undefined);
    }
  }, [defaultAccessLevel]);

  // Infer from policies only when the API does not expose a field-level enum (legacy / bulk edge cases).
  useEffect(() => {
    const hasKnownDefault =
      defaultAccessLevel !== undefined && !!ACCESS_LEVEL_TO_TYPE[defaultAccessLevel];

    if (hasKnownDefault) return;
    if (initialized) return;
    if (!policyResponse) return;

    if (policies.length > 0) {
      setSelectedAccessType(ACCESS_TYPES.CUSTOM);
    } else {
      setSelectedAccessType(ACCESS_TYPES.LOGGED_IN);
    }
    setInitialized(true);
  }, [defaultAccessLevel, policyResponse, policies.length, initialized]);

  const currentAccessType = selectedAccessType || ACCESS_TYPES.LOGGED_IN;

  const handleSaveSuccess = () => {
    setShowRuleSetForm(false);
    setEditingPolicy(undefined);
    refetch();
  };

  const handleAccessTypeSelect = (value: string) => {
    if (value === selectedAccessType) return;
    setPendingAccessType(value);
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmAccessTypeChange = async () => {
    if (!pendingAccessType) {
      setIsConfirmDialogOpen(false);
      return;
    }

    const newLevel = ACCESS_TYPE_TO_LEVEL[pendingAccessType];
    if (newLevel === undefined) {
      setIsConfirmDialogOpen(false);
      setPendingAccessType(null);
      return;
    }

    try {
      const res = await setRowColumnPermission({
        projectKey,
        schemaId,
        operation,
        policyType: level === "row" ? POLICY_TYPE.ROW : POLICY_TYPE.COLUMN,
        fieldNames: level === "column" ? fieldNames : [],
        accessLevel: newLevel,
      });

      if (res?.isSuccess) {
        showSuccessToast({ description: "Access level updated successfully" });
        setSelectedAccessType(pendingAccessType);
      } else {
        showErrorToast({ errors: res?.errors });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }

    setIsConfirmDialogOpen(false);
    setPendingAccessType(null);
  };

  const handleCancelAccessTypeChange = () => {
    setIsConfirmDialogOpen(false);
    setPendingAccessType(null);
  };

  const confirmationModalData = {
    dialogTitle: "Change access policy?",
    dialogSubtitle: `Are you sure you want to change the access policy to ${ACCESS_TYPE_LABELS[pendingAccessType ?? ""] ?? pendingAccessType}? This will affect who can access this ${isRowLevel ? "schema" : "field"}.`,
    confirmButton: "Confirm",
    cancelButton: "Cancel",
  };

  return (
    <div className="flex flex-col">
      <div className={ACCESS_STYLES[currentAccessType]}>
        <div className="flex flex-col items-start gap-2 dark:text-icon-warning">
          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              {currentAccessType === ACCESS_TYPES.PUBLIC
                ? ACCESS_ICONS.PUBLIC
                : ACCESS_ICONS.LOGGEDIN_OR_CUSTOM}
              <p className="min-w-0 font-bold">{ACCESS_LABELS[currentAccessType]}</p>
            </div>

            <div className="w-full shrink-0 sm:ml-auto sm:w-auto">
              <Select value={selectedAccessType} onValueChange={handleAccessTypeSelect}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Change Policy" />
                </SelectTrigger>

                <SelectContent>
                  {level === "column" && (
                    <SelectItem value={ACCESS_TYPES.INHERITED}>Inherited</SelectItem>
                  )}
                  <SelectItem value={ACCESS_TYPES.LOGGED_IN}>All logged in users</SelectItem>
                  <SelectItem value={ACCESS_TYPES.PUBLIC}>Public</SelectItem>
                  <SelectItem value={ACCESS_TYPES.CUSTOM}>Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p>{ACCESS_DESCRIPTIONS[currentAccessType]}</p>
        </div>
      </div>

      <div className="h-[calc(100vh-220px)] overflow-y-auto p-1 pb-10">
        {currentAccessType === ACCESS_TYPES.CUSTOM && (
          <>
            {showRuleSetForm ? (
              <RuleSetForm
                onCancel={handleSaveSuccess}
                schemaFields={schemaFields}
                schemaName={schemaName}
                schemaId={schemaId}
                operation={operation}
                fieldNames={fieldNames}
                editingPolicy={editingPolicy}
                level={level}
              />
            ) : isPolicyListLoading ? (
              <div
                className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-12"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <Loader className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                <span className="text-sm text-muted-foreground">Loading access rules…</span>
              </div>
            ) : (
              <SchemaAccessControlAccordion
                policies={policies}
                onAddRuleSet={() => setShowRuleSetForm(true)}
                onEditPolicy={(policy) => {
                  setEditingPolicy(policy);
                  setShowRuleSetForm(true);
                }}
              />
            )}
          </>
        )}
      </div>

      <Dialog
        open={isConfirmDialogOpen}
        onOpenChange={(open) => {
          setIsConfirmDialogOpen(open);
          if (!open) {
            setPendingAccessType(null);
          }
        }}
      >
        <ConfirmationModal
          onCancel={handleCancelAccessTypeChange}
          onConfirm={handleConfirmAccessTypeChange}
          data={confirmationModalData}
          buttonState={{ confirm: { disable: isUpdating } }}
        />
      </Dialog>
    </div>
  );
};
