"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui-kits/button/button";
import {
  ACCESS_LEVEL_TO_TYPE,
  ACCESS_TYPE_TO_LEVEL,
  ACCESS_TYPES,
  POLICY_TYPE,
  TAB_TO_OPERATION,
} from "@/data-gateway/constants/schema-access-control";
import { Loader } from "lucide-react";
import { SchemaAccessControlViewProps } from "@/data-gateway/models/schema-preview.types";
import type { IPolicyItem } from "@/data-gateway/models/data-service";
import { cn } from "@/lib/utils";
import { RuleSetForm } from "./rule-set-form";
import { SchemaAccessControlAccordion } from "./schema-access-control-accordion";
import {
  useGetPolicyData,
  useSetRowColumnPermission,
} from "@/data-gateway/hooks/use-configuration";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { accessEffect } from "@/data-gateway/utils/access-phrase";
import {
  accessPresets,
  type AccessPreset,
  type PresetRuleSet,
} from "@/data-gateway/utils/access-presets";
import {
  TIER_CONTAINER_CLASS,
  TIER_DOT_CLASS,
  TIER_VALUE_CLASS,
  tierFromType,
} from "../primitives";
import { AccessEffectLine } from "./access-effect-line";
import { AccessPresetList } from "./access-preset-list";

/** "Who is allowed" tile grid — Inherited is column-only (there is nothing to inherit from at row level). */
const ACCESS_TIER_TILES = [
  { type: ACCESS_TYPES.INHERITED, label: "Inherited" },
  { type: ACCESS_TYPES.PUBLIC, label: "Public" },
  { type: ACCESS_TYPES.LOGGED_IN, label: "Signed-in" },
  { type: ACCESS_TYPES.CUSTOM, label: "Custom" },
];

export const SchemaAccessControlView = ({
  schemaFields,
  schemaName,
  schemaId,
  level,
  operation,
  fieldNames,
  defaultAccessLevel,
  onRuleEditorOpenChange,
}: SchemaAccessControlViewProps) => {
  const [showRuleSetForm, setShowRuleSetForm] = useState(false);

  // The inspector widens from 460px to 480px for the rule editor; it needs to
  // be told, because the editor opens from inside here.
  useEffect(() => {
    onRuleEditorOpenChange?.(showRuleSetForm);
  }, [showRuleSetForm, onRuleEditorOpenChange]);
  const [editingPolicy, setEditingPolicy] = useState<IPolicyItem | undefined>(
    undefined,
  );
  // The tile the user currently has picked — drives the rest of the panel
  // (effect line, rule-set list) immediately, same as the design's "live"
  // preview. It only reaches the server once Save is pressed.
  const [selectedAccessType, setSelectedAccessType] = useState("");
  // The last value actually confirmed by the API, i.e. what Cancel reverts to
  // and what `selectedAccessType` is compared against to decide "dirty".
  const [lastSavedAccessType, setLastSavedAccessType] = useState("");
  const [initialized, setInitialized] = useState(false);
  /** Preset values handed to the form, and the set still to come after it saves. */
  const [seedRuleSet, setSeedRuleSet] = useState<PresetRuleSet | undefined>();
  const [queuedRuleSet, setQueuedRuleSet] = useState<PresetRuleSet | undefined>();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  // Fetch when access is custom, including first paint (selectedAccessType is still "" until useEffect).
  // Also fetch when defaultAccessLevel is unknown and we haven't yet determined the type.
  const defaultResolvedType =
    defaultAccessLevel !== undefined
      ? ACCESS_LEVEL_TO_TYPE[defaultAccessLevel]
      : undefined;
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
    isPolicyFetchEnabled &&
    (isPending || (isFetching && policyResponse === undefined));
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
      p.fieldNames &&
      p.fieldNames.length > 0 &&
      p.fieldNames.some((f) => fieldNames.includes(f))
    );
  });

  // Server / parent field access level is source of truth whenever it is known (refetch after save).
  useEffect(() => {
    if (defaultAccessLevel === undefined) return;
    const resolved = ACCESS_LEVEL_TO_TYPE[defaultAccessLevel];
    if (!resolved) return;
    setSelectedAccessType(resolved);
    setLastSavedAccessType(resolved);
    setInitialized(true);
    if (resolved !== ACCESS_TYPES.CUSTOM) {
      setShowRuleSetForm(false);
      setEditingPolicy(undefined);
    }
  }, [defaultAccessLevel]);

  // Infer from policies only when the API does not expose a field-level enum (legacy / bulk edge cases).
  useEffect(() => {
    const hasKnownDefault =
      defaultAccessLevel !== undefined &&
      !!ACCESS_LEVEL_TO_TYPE[defaultAccessLevel];

    if (hasKnownDefault) return;
    if (initialized) return;
    if (!policyResponse) return;

    const inferred =
      policies.length > 0 ? ACCESS_TYPES.CUSTOM : ACCESS_TYPES.LOGGED_IN;
    setSelectedAccessType(inferred);
    setLastSavedAccessType(inferred);
    setInitialized(true);
  }, [defaultAccessLevel, policyResponse, policies.length, initialized]);

  const currentAccessType = selectedAccessType || ACCESS_TYPES.LOGGED_IN;
  const isAccessTypeDirty =
    initialized && selectedAccessType !== lastSavedAccessType;

  /**
   * Custom means "only what these rules allow", so with no rule sets it denies
   * everyone — which is what the effect line above already warns about
   * ("allows nobody to read …"). Committing that from the tier footer is
   * almost always a half-finished edit rather than a deliberate lockout, so
   * this footer will not save it.
   *
   * It is not a dead end: the rule editor's own footer saves the tier and the
   * first rule set together, so Custom lands at the moment it starts meaning
   * something. Waiting for the policy fetch matters — an in-flight list is
   * empty, and disabling on that would flicker.
   */
  const isCustomWithoutRules =
    selectedAccessType === ACCESS_TYPES.CUSTOM &&
    !isPolicyListLoading &&
    policies.length === 0;

  const handleSaveSuccess = () => {
    refetch();
    setEditingPolicy(undefined);

    // "Owner, plus a support override" is two rule sets, and the form holds
    // one. The second is seeded as soon as the first lands.
    if (queuedRuleSet) {
      setSeedRuleSet(queuedRuleSet);
      setQueuedRuleSet(undefined);
      return;
    }

    setSeedRuleSet(undefined);
    setShowRuleSetForm(false);
  };

  const applyPreset = (preset: AccessPreset) => {
    const [first, ...rest] = preset.ruleSets;
    setEditingPolicy(undefined);
    setSeedRuleSet(first);
    setQueuedRuleSet(rest[0]);
    setShowRuleSetForm(true);
  };

  // Picking a tile is local only — it drives the effect line and rule-set
  // list immediately (so Custom can be set up before it's saved), but nothing
  // reaches the API until Save.
  const handleTierPick = (value: string) => {
    setSelectedAccessType(value);
  };

  /**
   * Persists the selected tier. Returns whether the caller may carry on — the
   * rule editor chains its own save onto this one, and must not send rules
   * for a policy whose level failed to save.
   */
  const handleSaveAccessType = async (): Promise<boolean> => {
    const newLevel = ACCESS_TYPE_TO_LEVEL[selectedAccessType];
    if (newLevel === undefined) return true;

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
        setLastSavedAccessType(selectedAccessType);
        return true;
      }

      showErrorToast({ errors: res?.errors });
      return false;
    } catch (error) {
      showErrorToast({ errors: error });
      return false;
    }
  };

  /** What the rule editor's footer runs before sending its own payload. */
  const saveAccessTypeIfDirty = async (): Promise<boolean> =>
    isAccessTypeDirty ? handleSaveAccessType() : true;

  const handleCancelAccessType = () => {
    setSelectedAccessType(lastSavedAccessType);
  };

  // The view is handed a numeric operation; the phrasing is keyed by tab id.
  const tabForOperation =
    Object.keys(TAB_TO_OPERATION).find((tab) => TAB_TO_OPERATION[tab] === operation) ?? "view";
  const effectSubject = isRowLevel
    ? schemaName
    : `${schemaName}.${fieldNames.join(", ")}`;

  const effect = accessEffect({
    tier: tierFromType(currentAccessType),
    tab: tabForOperation,
    subject: effectSubject,
    policies,
  });

  const visibleTiers =
    level === "column"
      ? ACCESS_TIER_TILES
      : ACCESS_TIER_TILES.filter((t) => t.type !== ACCESS_TYPES.INHERITED);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3">
        {/* Not "API is public", but what that means for this verb, here. */}
        <AccessEffectLine effect={effect} />

        {/* Stays visible while a rule set is being added or edited, so that
            form lands right under the Custom tile instead of replacing this
            section and losing the context of what's being configured. */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
            Who is allowed
          </p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Who is allowed">
            {visibleTiers.map(({ type, label }) => {
              const tier = tierFromType(type);
              const isSelected = type === selectedAccessType;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={showRuleSetForm}
                  onClick={() => handleTierPick(type)}
                  className={cn(
                    "flex h-[38px] items-center gap-2 rounded-md border px-2.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected
                      ? cn(TIER_CONTAINER_CLASS[tier], TIER_VALUE_CLASS[tier])
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border",
                      isSelected ? TIER_CONTAINER_CLASS[tier] : "border-border/60",
                    )}
                  >
                    {isSelected && (
                      <span className={cn("h-[7px] w-[7px] rounded-full", TIER_DOT_CLASS[tier])} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {currentAccessType === ACCESS_TYPES.CUSTOM && (
          <>
            {showRuleSetForm ? (
              // The form used to snap in the instant a preset/Add was clicked;
              // a short fade + rise reads as it opening rather than a jump cut.
              // `dg-rise-in` is the shared one-shot from globals.css — a CSS
              // animation settles back to `transform: none`, where a retained
              // motion transform would become the containing block for the
              // form's sticky footer.
              <div key="rule-set-form" className="dg-rise-in">
                <RuleSetForm
                  onCancel={handleSaveSuccess}
                  schemaFields={schemaFields}
                  schemaName={schemaName}
                  schemaId={schemaId}
                  operation={operation}
                  fieldNames={fieldNames}
                  editingPolicy={editingPolicy}
                  level={level}
                  seed={seedRuleSet}
                  isAccessTypeDirty={isAccessTypeDirty}
                  onBeforeSave={saveAccessTypeIfDirty}
                />
              </div>
            ) : isPolicyListLoading ? (
              <div
                className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-12"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <Loader
                  className="h-8 w-8 animate-spin text-muted-foreground"
                  aria-hidden
                />
                <span className="text-sm text-muted-foreground">
                  Loading access rules…
                </span>
              </div>
            ) : policies.length === 0 ? (
              <AccessPresetList
                presets={accessPresets(schemaFields)}
                onApply={applyPreset}
                onStartBlank={() => {
                  setSeedRuleSet(undefined);
                  setQueuedRuleSet(undefined);
                  setShowRuleSetForm(true);
                }}
              />
            ) : (
              <SchemaAccessControlAccordion
                policies={policies}
                onAddRuleSet={() => {
                  setSeedRuleSet(undefined);
                  setQueuedRuleSet(undefined);
                  setShowRuleSetForm(true);
                }}
                onEditPolicy={(policy) => {
                  setSeedRuleSet(undefined);
                  setQueuedRuleSet(undefined);
                  setEditingPolicy(policy);
                  setShowRuleSetForm(true);
                }}
              />
            )}
          </>
        )}
      </div>

      {!showRuleSetForm && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border/40 pt-3">
          <span
            className={cn(
              "flex-1 text-xs",
              isCustomWithoutRules && isAccessTypeDirty
                ? "text-warning-700"
                : "text-muted-foreground",
            )}
          >
            {isCustomWithoutRules && isAccessTypeDirty
              ? "Add a rule set to save Custom"
              : isAccessTypeDirty
                ? "Unsaved"
                : "No changes"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isAccessTypeDirty || isUpdating}
            onClick={handleCancelAccessType}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!isAccessTypeDirty || isUpdating || isCustomWithoutRules}
            onClick={handleSaveAccessType}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
};
