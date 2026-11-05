"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { useState } from "react";
import { useIamOrganizations, useIamRoles, useIamUsers } from "../../hooks/use-dms";
import { ObjectPrincipalType } from "../../models/dms.model";
import { PrincipalPicker, PrincipalPickerOption } from "../principal-picker/principal-picker";

export const PRINCIPAL_TYPES: ObjectPrincipalType[] = ["User", "Role", "Organization", "Everyone"];
const GLOBAL_ROLE_SCOPE = "__all_organizations__";

export interface PrincipalSelection {
  principalType: ObjectPrincipalType;
  changePrincipalType: (next: ObjectPrincipalType) => void;
  selectedPrincipals: string[];
  setSelectedPrincipals: (next: string[]) => void;
  roleOrganizationId: string;
  setRoleOrganizationId: (next: string) => void;
  setSearch: (next: string) => void;
  /** Picker options for the current principal type and search. */
  options: PrincipalPickerOption[];
  isLoading: boolean;
  organizations: PrincipalPickerOption[];
  /** False for Everyone, which has no id to pick. */
  needsPrincipal: boolean;
  /** The organization a Role is scoped to on the request: "default" for all organizations, undefined for other types. */
  roleScopeOrganizationId: string | undefined;
  /** Clears the picked principals and the search, keeping the principal type. */
  clearPicks: () => void;
}

/**
 * Who an access rule or share is for: the principal type, the picked IAM ids, and a
 * Role's organization scope. The IAM lookups are wired unconditionally so their cache
 * keys stay stable; each stays dormant until `enabled` and its principal type is picked.
 */
export function usePrincipalSelection(enabled: boolean): PrincipalSelection {
  const [principalType, setPrincipalType] = useState<ObjectPrincipalType>("User");
  const [selectedPrincipals, setSelectedPrincipals] = useState<string[]>([]);
  const [roleOrganizationId, setRoleOrganizationId] = useState(GLOBAL_ROLE_SCOPE);
  const [search, setSearch] = useState("");

  const users = useIamUsers(search, enabled && principalType === "User");
  const roles = useIamRoles(search, enabled && principalType === "Role");
  const organizations = useIamOrganizations(
    principalType === "Organization" ? search : "",
    enabled && (principalType === "Organization" || principalType === "Role"),
  );

  // A user id and a role slug are not interchangeable, so switching type resets the
  // picks rather than carrying them over into invalid entries. Done in the handler
  // (not an effect) to avoid cascading renders.
  const changePrincipalType = (next: ObjectPrincipalType) => {
    setPrincipalType(next);
    setSelectedPrincipals([]);
    setRoleOrganizationId(GLOBAL_ROLE_SCOPE);
    setSearch("");
  };

  const options =
    principalType === "User"
      ? (users.data ?? [])
      : principalType === "Role"
        ? (roles.data ?? [])
        : principalType === "Organization"
          ? (organizations.data ?? [])
          : [];

  const isLoading =
    principalType === "User"
      ? users.isLoading
      : principalType === "Role"
        ? roles.isLoading
        : principalType === "Organization"
          ? organizations.isLoading
          : false;

  return {
    principalType,
    changePrincipalType,
    selectedPrincipals,
    setSelectedPrincipals,
    roleOrganizationId,
    setRoleOrganizationId,
    setSearch,
    options,
    isLoading,
    organizations: organizations.data ?? [],
    needsPrincipal: principalType !== "Everyone",
    roleScopeOrganizationId:
      principalType === "Role"
        ? roleOrganizationId === GLOBAL_ROLE_SCOPE
          ? "default"
          : roleOrganizationId
        : undefined,
    clearPicks: () => {
      setSelectedPrincipals([]);
      setSearch("");
    },
  };
}

interface PrincipalSelectorProps {
  selection: PrincipalSelection;
  /** Shown under the picker. */
  hint: string;
}

/** Principal type tabs, the IAM picker, and a Role's organization scope. */
export function PrincipalSelector({ selection, hint }: Readonly<PrincipalSelectorProps>) {
  const { t } = useT("data.storage");
  const { principalType } = selection;
  const typeLabels: Record<ObjectPrincipalType, string> = {
    User: t("PRINCIPAL_SELECTOR.TYPE_USER"),
    Role: t("PRINCIPAL_SELECTOR.TYPE_ROLE"),
    Organization: t("PRINCIPAL_SELECTOR.TYPE_ORGANIZATION"),
    Everyone: t("PRINCIPAL_SELECTOR.TYPE_EVERYONE"),
  };
  const pickerLabels: Record<ObjectPrincipalType, string> = {
    User: t("PRINCIPAL_SELECTOR.SELECT_USERS"),
    Role: t("PRINCIPAL_SELECTOR.SELECT_ROLES"),
    Organization: t("PRINCIPAL_SELECTOR.SELECT_ORGANIZATIONS"),
    Everyone: "",
  };

  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("PRINCIPAL_SELECTOR.WHO_SHOULD_HAVE_ACCESS")}</label>
        <div className="flex flex-wrap gap-2">
          {PRINCIPAL_TYPES.map((type) => {
            const active = principalType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selection.changePrincipalType(type)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={active}
              >
                {typeLabels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {selection.needsPrincipal ? (
        <div className="space-y-4">
          <PrincipalPicker
            label={pickerLabels[principalType]}
            options={selection.options}
            selected={selection.selectedPrincipals}
            onChange={selection.setSelectedPrincipals}
            isLoading={selection.isLoading}
            onSearchChange={selection.setSearch}
            hint={hint}
          />
          {principalType === "Role" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="role-organization-scope">
                {t("PRINCIPAL_SELECTOR.ROLE_SCOPE")}
              </label>
              <Select
                value={selection.roleOrganizationId}
                onValueChange={selection.setRoleOrganizationId}
              >
                <SelectTrigger id="role-organization-scope" aria-label={t("PRINCIPAL_SELECTOR.ROLE_SCOPE")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_ROLE_SCOPE}>{t("PRINCIPAL_SELECTOR.ALL_ORGANIZATIONS")}</SelectItem>
                  {selection.organizations.map((organization) => (
                    <SelectItem key={organization.value} value={organization.value}>
                      {organization.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {t("PRINCIPAL_SELECTOR.CHOOSE_AN_ORGANIZATION_TO_GRANT_THE")}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          {t("PRINCIPAL_SELECTOR.EVERYONE_MATCHES_ANY_AUTHENTICATED")}
        </div>
      )}
    </>
  );
}
