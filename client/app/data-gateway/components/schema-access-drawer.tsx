"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerClose,
  DrawerTitle,
} from "@/components/ui-kits/drawer/drawer";
import { Button } from "@/components/ui-kits/button/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui-kits/tabs/tabs";
import { cn } from "@/lib/utils";
import { Plus, ShieldCheck, X } from "lucide-react";
import { useGetRoles } from "@blocks-idp/iam/hooks/use-roles";
import { useGetPermissions } from "@blocks-idp/iam/hooks/use-permission";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { IRole } from "@blocks-idp/iam/models/role";
import { SchemaAccessList } from "./schema-access-list";
import type {
  AccessEntry,
  PermissionOption,
} from "../models/schema-access.types";
import { FieldAccessTarget } from "../models/schema-access.types";
import { sanitizeRuleSet, uniqueStrings } from "../utils/schema-access.utils";
import { useSetDataAccess } from "../hooks/use-configuration";
import {
  IDataAccessRuleSet,
  ISetDataAccessPayload,
} from "../models/data-service";
// import { SchemaRlsToggle } from "./schema-rls-toggle";
import { SchemaAccessToolbar } from "./schema-access-toolbar";
import { useQueries, useQuery } from "@tanstack/react-query";
import { roleService } from "@blocks-idp/iam/services/role.service";
import { userService } from "@blocks-idp/iam/services/user.service";
import { permissionService } from "@blocks-idp/iam/services/permission.service";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";

type ResolvedPermission = {
  resource: string;
  name: string;
  resourceGroup?: string;
  id?: string;
};

type SchemaAccessDrawerProps = {
  trigger: ReactNode;
  schemaId: string;
  readAccess?: IDataAccessRuleSet;
  writeAccess?: IDataAccessRuleSet;
  deleteAccess?: IDataAccessRuleSet;
  isRlsEnabled?: boolean;
  isClsEnabled?: boolean;
  title?: string;
  message?: ReactNode;
  className?: string;
  fieldTargets?: FieldAccessTarget[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
};

type AccessTab = "view" | "edit" | "delete";

type AccessTabMeta = {
  label: string;
};

const TAB_ORDER: AccessTab[] = ["view", "edit", "delete"];

const TAB_META: Record<AccessTab, AccessTabMeta> = {
  view: { label: "View" },
  edit: {
    label: "Write/Edit",
  },
  delete: {
    label: "Delete",
  },
};

const aggregateFieldRuleSets = (
  targets: FieldAccessTarget[],
  key: keyof Pick<
    FieldAccessTarget,
    "readAccess" | "writeAccess" | "deleteAccess"
  >,
): IDataAccessRuleSet => {
  const roles: (string | null | undefined)[] = [];
  const permissions: (string | null | undefined)[] = [];
  const users: (string | null | undefined)[] = [];

  targets.forEach((target) => {
    const ruleSet = target[key];
    if (ruleSet) {
      roles.push(...ruleSet.roles);
      permissions.push(...ruleSet.permissions);
      users.push(...ruleSet.users);
    }
  });

  return {
    roles: uniqueStrings(roles),
    permissions: uniqueStrings(permissions),
    users: uniqueStrings(users),
  };
};

const EMPTY_FIELD_TARGETS: FieldAccessTarget[] = [];

const createEmptyEntries = (): Record<AccessTab, AccessEntry[]> => ({
  view: [],
  edit: [],
  delete: [],
});

const cloneEntries = (
  source: Record<AccessTab, AccessEntry[]>,
): Record<AccessTab, AccessEntry[]> =>
  TAB_ORDER.reduce(
    (acc, tab) => {
      acc[tab] = source[tab].map((entry) => ({ ...entry }));
      return acc;
    },
    {} as Record<AccessTab, AccessEntry[]>,
  );

const normalizeEntries = (source: Record<AccessTab, AccessEntry[]>) =>
  TAB_ORDER.reduce(
    (acc, tab) => {
      acc[tab] = source[tab].map((entry) => ({
        ...entry,
        name: entry.name.trim(),
        department: entry.department?.trim()
          ? entry.department.trim()
          : undefined,
      }));
      return acc;
    },
    {} as Record<AccessTab, AccessEntry[]>,
  );

type ResolvedRole = {
  slug: string;
  name: string;
  id?: string;
};

type ResolvedUser = {
  id: string;
  name: string;
  email?: string;
};

export function SchemaAccessDrawer({
  trigger,
  schemaId,
  readAccess,
  writeAccess,
  deleteAccess,
  // isRlsEnabled,
  // isClsEnabled,
  title,
  className,
  fieldTargets: fieldTargetsProp,
  open,
  onOpenChange,
  onSuccess,
}: SchemaAccessDrawerProps) {
  const fieldTargets = fieldTargetsProp ?? EMPTY_FIELD_TARGETS;
  const [activeTab, setActiveTab] = useState<AccessTab>("view");
  const [isEditing, setIsEditing] = useState(false);
  const [entriesByTab, setEntriesByTab] = useState<
    Record<AccessTab, AccessEntry[]>
  >(() => createEmptyEntries());
  const [draftEntriesByTab, setDraftEntriesByTab] = useState<
    Record<AccessTab, AccessEntry[]>
  >(() => createEmptyEntries());
  const [isTabSwitchConfirmationOpen, setIsTabSwitchConfirmationOpen] =
    useState(false);
  const [pendingTab, setPendingTab] = useState<AccessTab | null>(null);
  const [isCloseConfirmationOpen, setIsCloseConfirmationOpen] = useState(false);
  const previousEntriesRef =
    useRef<Record<AccessTab, AccessEntry[]>>(createEmptyEntries());

  const { mutateAsync: setDataAccess, isPending: isSaving } =
    useSetDataAccess(schemaId);

  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const { data: rolesData, isLoading: isRolesLoading } = useGetRoles({
    page: 0,
    pageSize: 100,
    projectKey: projectKey,
    sort: { property: "Name", isDescending: false },
    filter: {
      search: "",
    },
  });

  const availableRoles: IRole[] = rolesData?.data ?? [];

  const schemaReadAccess = useMemo(
    () => sanitizeRuleSet(readAccess),
    [readAccess],
  );
  const schemaWriteAccess = useMemo(
    () => sanitizeRuleSet(writeAccess),
    [writeAccess],
  );
  const schemaDeleteAccess = useMemo(
    () => sanitizeRuleSet(deleteAccess),
    [deleteAccess],
  );

  const effectiveReadAccess = useMemo(() => {
    if (fieldTargets.length > 0) {
      return aggregateFieldRuleSets(fieldTargets, "readAccess");
    }
    return schemaReadAccess;
  }, [fieldTargets, schemaReadAccess]);

  const effectiveWriteAccess = useMemo(() => {
    if (fieldTargets.length > 0) {
      return aggregateFieldRuleSets(fieldTargets, "writeAccess");
    }
    return schemaWriteAccess;
  }, [fieldTargets, schemaWriteAccess]);

  const effectiveDeleteAccess = useMemo(() => {
    if (fieldTargets.length > 0) {
      return aggregateFieldRuleSets(fieldTargets, "deleteAccess");
    }
    return schemaDeleteAccess;
  }, [fieldTargets, schemaDeleteAccess]);

  const allRoleSlugs = useMemo(
    () =>
      uniqueStrings([
        ...effectiveReadAccess.roles,
        ...effectiveWriteAccess.roles,
        ...effectiveDeleteAccess.roles,
      ]),
    [effectiveReadAccess, effectiveWriteAccess, effectiveDeleteAccess],
  );

  const allUserIds = useMemo(
    () =>
      uniqueStrings([
        ...effectiveReadAccess.users,
        ...effectiveWriteAccess.users,
        ...effectiveDeleteAccess.users,
      ]),
    [effectiveReadAccess, effectiveWriteAccess, effectiveDeleteAccess],
  );

  const allPermissionResources = useMemo(
    () =>
      uniqueStrings([
        ...effectiveReadAccess.permissions,
        ...effectiveWriteAccess.permissions,
        ...effectiveDeleteAccess.permissions,
      ]),
    [effectiveReadAccess, effectiveWriteAccess, effectiveDeleteAccess],
  );

  const rolesBySlugQuery = useQuery({
    queryKey: ["roles", "by-slug", projectKey, allRoleSlugs],
    queryFn: () =>
      roleService.getRoles({
        page: 0,
        pageSize: Math.max(allRoleSlugs.length, 1),
        projectKey: projectKey,
        filter: {
          slugs: allRoleSlugs,
          search: "",
        },
        sort: { property: "Name", isDescending: false },
      }),
    enabled: Boolean(projectKey && allRoleSlugs.length > 0),
    staleTime: 5 * 60_000,
  });

  const permissionsByResourceQuery = useQuery({
    queryKey: [
      "permissions",
      "by-resource",
      projectKey,
      allPermissionResources,
    ],
    queryFn: () =>
      permissionService.getPermissions({
        page: 0,
        pageSize: Math.max(allPermissionResources.length, 1),
        projectKey: projectKey,
        roles: [],
        sort: { property: "Name", isDescending: false },
        filter: {
          search: "",
          isBuiltIn: "",
          resources: allPermissionResources,
        },
      }),
    enabled: Boolean(projectKey && allPermissionResources.length > 0),
    staleTime: 5 * 60_000,
  });

  const userQueries = useQueries({
    queries:
      projectKey && allUserIds.length > 0
        ? allUserIds.map((id) => ({
            queryKey: ["user", projectKey, id],
            queryFn: () =>
              userService.getUserById({ id, projectKey: projectKey }),
            enabled: true,
            staleTime: 5 * 60_000,
          }))
        : [],
  });

  const resolvedRoles = useMemo(() => {
    const map = new Map<string, ResolvedRole>();
    rolesBySlugQuery.data?.data?.forEach((role) => {
      if (role.slug) {
        map.set(role.slug, {
          slug: role.slug,
          name: role.name,
          id: role.itemId,
        });
      }
    });
    return map;
  }, [rolesBySlugQuery.data]);

  const resolvedUsers = useMemo(() => {
    const map = new Map<string, ResolvedUser>();
    allUserIds.forEach((id, index) => {
      const result = userQueries[index]?.data?.data;
      if (result) {
        const displayName = [result.firstName, result.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        map.set(id, {
          id,
          name: displayName || result.email || result.userName || id,
          email: result.email,
        });
      }
    });
    return map;
  }, [allUserIds, userQueries]);

  const resolvedPermissions = useMemo(() => {
    const map = new Map<string, ResolvedPermission>();

    // Add OWNER as a built-in resolved permission only for schema-level access
    if (fieldTargets.length === 0) {
      map.set("OWNER", {
        resource: "OWNER",
        name: "OWNER",
        resourceGroup: "owner",
        id: "owner-permission",
      });
    }

    permissionsByResourceQuery.data?.data?.forEach((permission) => {
      map.set(permission.resource, {
        resource: permission.resource,
        name: permission.name,
        resourceGroup: permission.resourceGroup,
        id: permission.itemId,
      });
    });
    return map;
  }, [permissionsByResourceQuery.data, fieldTargets.length]);

  const {
    data: permissionsData,
    isLoading: isPermissionsLoading,
    isFetching: isPermissionsFetching,
  } = useGetPermissions({
    projectKey: projectKey,
    page: 0,
    pageSize: 100,
    search: "",
    isBuiltIn: "",
    roles: [],
    resourceGroup: "",
    type: 3,
    sort: { property: "Name", isDescending: false },
  });

  const availablePermissions: PermissionOption[] = useMemo(() => {
    const map = new Map<string, PermissionOption>();

    // Add OWNER as a built-in permission option only for schema-level access
    if (fieldTargets.length === 0) {
      map.set("OWNER", {
        resource: "OWNER",
        itemId: "owner-permission",
        name: "OWNER",
        resourceGroup: "owner",
        description: "Owner permission for the schema",
      });
    }

    permissionsData?.data?.forEach((permission) => {
      map.set(permission.resource, {
        resource: permission.resource,
        itemId: permission.itemId,
        name: permission.name,
        resourceGroup: permission.resourceGroup,
        description: permission.description,
      });
    });

    resolvedPermissions.forEach((permission, resource) => {
      if (!map.has(resource)) {
        map.set(resource, {
          resource,
          itemId: permission.id,
          name: permission.name,
          resourceGroup: permission.resourceGroup,
        });
      }
    });

    return Array.from(map.values());
  }, [permissionsData, resolvedPermissions, fieldTargets.length]);

  const serverEntries = useMemo(() => {
    const buildEntriesFromRuleSet = (
      ruleSet: IDataAccessRuleSet,
    ): AccessEntry[] => {
      const roleEntries = ruleSet.roles.map((roleSlug) => {
        const role = resolvedRoles.get(roleSlug);
        return {
          type: "Role" as const,
          name: role?.name ?? roleSlug,
          department: role?.slug ?? roleSlug,
          roleSlug,
        };
      });

      const userEntries = ruleSet.users.map((userId) => {
        const user = resolvedUsers.get(userId);
        return {
          type: "User" as const,
          name: user?.name ?? userId,
          department: user?.email,
          userId,
        };
      });

      const permissionEntries = ruleSet.permissions.map(
        (permissionResource) => {
          const permission = resolvedPermissions.get(permissionResource);
          return {
            type: "Permission" as const,
            name: permission?.name ?? permissionResource,
            department: permission?.resourceGroup ?? permission?.resource,
            permissionResource,
          };
        },
      );

      return [...roleEntries, ...userEntries, ...permissionEntries];
    };

    return {
      view: buildEntriesFromRuleSet(effectiveReadAccess),
      edit: buildEntriesFromRuleSet(effectiveWriteAccess),
      delete: buildEntriesFromRuleSet(effectiveDeleteAccess),
    };
  }, [
    effectiveReadAccess,
    effectiveWriteAccess,
    effectiveDeleteAccess,
    resolvedRoles,
    resolvedUsers,
    resolvedPermissions,
  ]);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    const nextEntries = cloneEntries(serverEntries);

    // Use ref to compare with previous entries to avoid unnecessary updates
    const hasChanged = TAB_ORDER.some((tab) => {
      const previousEntries = previousEntriesRef.current[tab];
      const newEntries = nextEntries[tab];

      if (previousEntries.length !== newEntries.length) {
        return true;
      }

      return previousEntries.some((prevEntry, index) => {
        const newEntry = newEntries[index];
        if (!newEntry) return true;

        return (
          prevEntry.type !== newEntry.type ||
          prevEntry.name !== newEntry.name ||
          prevEntry.department !== newEntry.department ||
          prevEntry.roleSlug !== newEntry.roleSlug ||
          prevEntry.userId !== newEntry.userId ||
          prevEntry.permissionResource !== newEntry.permissionResource
        );
      });
    });

    if (hasChanged) {
      setEntriesByTab(nextEntries);
      setDraftEntriesByTab(cloneEntries(serverEntries));
      previousEntriesRef.current = cloneEntries(nextEntries);
    }
  }, [serverEntries, isEditing]);

  useEffect(() => {
    // setActiveTab("view");
    setIsEditing(false);
    // Only reset entries when schemaId changes, not when fieldTargets change
    // fieldTargets changes will be handled by the serverEntries useEffect
    if (schemaId) {
      setEntriesByTab(createEmptyEntries());
      setDraftEntriesByTab(createEmptyEntries());
      previousEntriesRef.current = createEmptyEntries();
    }
  }, [schemaId]);

  const currentEntries = useMemo(
    () => (isEditing ? draftEntriesByTab : entriesByTab),
    [isEditing, draftEntriesByTab, entriesByTab],
  );

  // Check if there are unsaved changes (dirty data)
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing) return false;

    // Helper to normalize values for comparison (treat undefined, null, and empty string as equal)
    const normalize = (value: string | undefined | null) => {
      return value?.trim() || "";
    };

    return TAB_ORDER.some((tab) => {
      const draftEntries = draftEntriesByTab[tab];
      const savedEntries = entriesByTab[tab];

      if (draftEntries.length !== savedEntries.length) {
        return true;
      }

      return draftEntries.some((draftEntry, index) => {
        const savedEntry = savedEntries[index];
        if (!savedEntry) return true;

        // Compare with normalization to avoid false positives
        return (
          draftEntry.type !== savedEntry.type ||
          normalize(draftEntry.name) !== normalize(savedEntry.name) ||
          normalize(draftEntry.department) !==
            normalize(savedEntry.department) ||
          normalize(draftEntry.roleSlug) !== normalize(savedEntry.roleSlug) ||
          normalize(draftEntry.userId) !== normalize(savedEntry.userId) ||
          normalize(draftEntry.permissionResource) !==
            normalize(savedEntry.permissionResource)
        );
      });
    });
  }, [isEditing, draftEntriesByTab, entriesByTab]);

  const handleStartEdit = () => {
    setDraftEntriesByTab(cloneEntries(entriesByTab));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraftEntriesByTab(cloneEntries(entriesByTab));
    setIsEditing(false);
  };

  const handleTabSwitchRequest = (nextTab: AccessTab) => {
    if (isEditing && nextTab !== activeTab && hasUnsavedChanges) {
      setPendingTab(nextTab);
      setIsTabSwitchConfirmationOpen(true);
    } else {
      // Exit edit mode when switching tabs
      if (isEditing) {
        setIsEditing(false);
        setDraftEntriesByTab(cloneEntries(entriesByTab));
      }
      setActiveTab(nextTab);
    }
  };

  const handleConfirmTabSwitch = async () => {
    if (pendingTab) {
      // Save changes before switching
      await handleSaveEdit();
      // handleSaveEdit already sets isEditing to false
      setActiveTab(pendingTab);
    }
    setIsTabSwitchConfirmationOpen(false);
    setPendingTab(null);
  };

  const handleCancelTabSwitch = () => {
    setIsTabSwitchConfirmationOpen(false);
    setPendingTab(null);
  };

  const handleDrawerOpenChange = (open: boolean) => {
    // If trying to close the drawer and there are unsaved changes, show confirmation
    if (!open && hasUnsavedChanges) {
      setIsCloseConfirmationOpen(true);
      return;
    }

    // Otherwise, proceed with closing
    if (!open) {
      // Reset edit mode when closing
      setIsEditing(false);
      setDraftEntriesByTab(cloneEntries(entriesByTab));
    }

    onOpenChange?.(open);
  };

  const handleConfirmClose = () => {
    setIsCloseConfirmationOpen(false);
    setIsEditing(false);
    setDraftEntriesByTab(cloneEntries(entriesByTab));
    onOpenChange?.(false);
  };

  const handleCancelClose = () => {
    setIsCloseConfirmationOpen(false);
  };

  const handleSaveEdit = async () => {
    const normalized = normalizeEntries(draftEntriesByTab);

    const buildRuleSet = (
      entries: AccessEntry[],
    ): ISetDataAccessPayload["readAccess"] => {
      const roles: string[] = [];
      const users: string[] = [];
      const permissions: string[] = [];

      entries.forEach((entry) => {
        if (entry.type === "Role") {
          const identifier = entry.roleSlug?.trim() || entry.name.trim();
          if (identifier) {
            roles.push(identifier);
          }
        } else if (entry.type === "User") {
          const identifier = entry.userId?.trim() || entry.name.trim();
          if (identifier) {
            users.push(identifier);
          }
        } else if (entry.type === "Permission") {
          const identifier =
            entry.permissionResource?.trim() || entry.name.trim();
          if (identifier) {
            permissions.push(identifier);
          }
        }
      });

      return {
        roles,
        permissions,
        users,
      };
    };

    const shouldUpdateSchemaLevel = fieldTargets.length === 0;
    const readRuleSetPayload = buildRuleSet(normalized.view);
    const writeRuleSetPayload = buildRuleSet(normalized.edit);
    const deleteRuleSetPayload = buildRuleSet(normalized.delete);
    const viewChanged =
      JSON.stringify(normalized.view) !== JSON.stringify(serverEntries.view);
    const editChanged =
      JSON.stringify(normalized.edit) !== JSON.stringify(serverEntries.edit);
    const deleteChanged =
      JSON.stringify(normalized.delete) !==
      JSON.stringify(serverEntries.delete);

    const resolvedSchemaReadAccess = shouldUpdateSchemaLevel
      ? viewChanged
        ? readRuleSetPayload
        : schemaReadAccess
      : schemaReadAccess;
    const resolvedSchemaWriteAccess = shouldUpdateSchemaLevel
      ? editChanged
        ? writeRuleSetPayload
        : schemaWriteAccess
      : schemaWriteAccess;
    const resolvedSchemaDeleteAccess = shouldUpdateSchemaLevel
      ? deleteChanged
        ? deleteRuleSetPayload
        : schemaDeleteAccess
      : schemaDeleteAccess;

    const payload: ISetDataAccessPayload = {
      projectKey: projectKey,
      schemaId: schemaId,
      readAccess: resolvedSchemaReadAccess,
      writeAccess: resolvedSchemaWriteAccess,
      deleteAccess: resolvedSchemaDeleteAccess,
      fields:
        fieldTargets.length > 0
          ? fieldTargets.map((target) => ({
              name: target.name,
              readAccess: viewChanged
                ? readRuleSetPayload
                : sanitizeRuleSet(target.readAccess),
              writeAccess: editChanged
                ? writeRuleSetPayload
                : sanitizeRuleSet(target.writeAccess),
              deleteAccess: deleteChanged
                ? deleteRuleSetPayload
                : sanitizeRuleSet(target.deleteAccess),
            }))
          : [],
    };

    try {
      await setDataAccess(payload);
      setEntriesByTab(cloneEntries(normalized));
      setDraftEntriesByTab(cloneEntries(normalized));
      setIsEditing(false);
      // Call success callback to refresh parent data
      onSuccess?.();
    } catch (error) {
      console.error("Failed to set schema access", error);
    }
  };

  const handleEntryChange = (
    tab: AccessTab,
    index: number,
    updatedEntry: AccessEntry,
  ) => {
    setDraftEntriesByTab((prev) => {
      const next = cloneEntries(prev);
      const nextEntries = [...next[tab]];
      nextEntries[index] = { ...updatedEntry };
      next[tab] = nextEntries;
      return next;
    });
  };

  const handleAddEntry = (tab: AccessTab) => {
    setDraftEntriesByTab((prev) => {
      const next = cloneEntries(prev);
      next[tab] = [
        ...next[tab],
        {
          type: "Role",
          name: "",
          roleSlug: undefined,
          userId: undefined,
          permissionResource: undefined,
        },
      ];
      return next;
    });
    // Enter edit mode when adding an entry
    setIsEditing(true);
  };

  const handleRemoveEntry = (tab: AccessTab, index: number) => {
    setDraftEntriesByTab((prev) => {
      const next = cloneEntries(prev);
      next[tab] = next[tab].filter((_, itemIndex) => itemIndex !== index);
      return next;
    });
  };

  const entriesAreEditable = isEditing && !isSaving;

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={handleDrawerOpenChange}
      handleOnly
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l bg-background p-6 md:w-[70vw] md:max-w-4xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          className,
        )}
        style={{ userSelect: "text" }}
      >
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-4">
            <DrawerTitle className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              {title}
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label="Close schema access drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = value as AccessTab;
              handleTabSwitchRequest(nextTab);
            }}
            className="mt-6 flex flex-1 flex-col"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <TabsList className="order-2 w-full justify-start bg-muted/60 p-1 md:order-1 md:max-w-xs">
                {TAB_ORDER.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="flex-1">
                    {TAB_META[tab].label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Only show RLS toggle for schema-level access (not field-level) */}
              {/* {fieldTargets.length === 0 && (
                <SchemaRlsToggle
                  className="order-1 md:order-2"
                  schemaId={schemaId}
                  projectKey={projectKey}
                  isRlsEnabled={isRlsEnabled}
                  isClsEnabled={isClsEnabled}
                />
              )} */}
            </div>

            {TAB_ORDER.map((tab) => {
              const entries = currentEntries[tab];
              const hasNoEntriesInTab = entries.length === 0;
              // Only show empty state when not editing (i.e., after saving)
              const shouldShowEmptyState = hasNoEntriesInTab && !isEditing;

              return (
                <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
                  {shouldShowEmptyState ? (
                    <div className="flex flex-1 items-center justify-center py-12">
                      <div className="flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="space-y-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            This schema doesn’t have any access configuration
                            yet. Click Add Configuration to set one up.
                          </h3>
                        </div>
                        <Button
                          onClick={() => handleAddEntry(tab)}
                          className="gap-2"
                          disabled={isSaving}
                        >
                          <Plus className="h-4 w-4" />
                          Add Configuration
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <SchemaAccessToolbar
                        isEditing={isEditing}
                        isSaving={isSaving}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onAdd={() => handleAddEntry(tab)}
                        onEdit={handleStartEdit}
                        onCancel={handleCancelEdit}
                        onSave={handleSaveEdit}
                      />

                      <SchemaAccessList
                        entries={entries}
                        isEditing={entriesAreEditable}
                        onEntryChange={(index, entry) =>
                          handleEntryChange(tab, index, entry)
                        }
                        onRemoveEntry={(index) => handleRemoveEntry(tab, index)}
                        roles={availableRoles}
                        rolesLoading={isRolesLoading}
                        permissions={availablePermissions}
                        permissionsLoading={
                          isPermissionsLoading || isPermissionsFetching
                        }
                        className="mt-0"
                        projectKey={projectKey}
                      />
                    </>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </DrawerContent>

      <Dialog
        open={isTabSwitchConfirmationOpen}
        onOpenChange={setIsTabSwitchConfirmationOpen}
      >
        <ConfirmationModal
          onCancel={handleCancelTabSwitch}
          onConfirm={handleConfirmTabSwitch}
          data={{
            dialogTitle: "Unsaved Changes",
            dialogSubtitle:
              "You have unsaved changes. Do you want to save your changes before switching tabs?",
            confirmButton: "Save & Switch",
            cancelButton: "Cancel",
          }}
        />
      </Dialog>

      <Dialog
        open={isCloseConfirmationOpen}
        onOpenChange={setIsCloseConfirmationOpen}
      >
        <ConfirmationModal
          onCancel={handleCancelClose}
          onConfirm={handleConfirmClose}
          data={{
            dialogTitle: "Unsaved Changes",
            dialogSubtitle:
              "You have unsaved changes. Are you sure you want to close without saving?",
            confirmButton: "Close Without Saving",
            cancelButton: "Cancel",
          }}
        />
      </Dialog>
    </Drawer>
  );
}
